import { MessageRole, PendingType } from '@prisma/client';
import { AssistantMessage, MessageContent, UserMessage } from '../../lib/ai';

import { prisma } from '../../lib/prisma';
import { queueImageUpload } from '../../lib/tasks';
import { logger } from '../../utils/logger';
import { downloadTwilioMedia } from '../../utils/media';
import { extractTextContent } from '../../utils/text';
import { GraphState } from '../state';

/**
 * Ingests incoming Twilio messages, processes media attachments, manages conversation history,
 * and prepares data for downstream processing in the agent graph.
 *
 * Handles message merging for multi-part messages, media download and storage,
 * and conversation history preparation with both image and text-only versions.
 */
export async function ingestMessage(state: GraphState): Promise<GraphState> {
  const { input, user, conversationId, graphRunId } = state;
  const {
    Body: text,
    ButtonPayload: buttonPayload,
    NumMedia: numMedia,
    MediaUrl0: mediaUrl0,
    MediaContentType0: mediaContentType0,
    WaId: whatsappId,
  } = input;

  if (!whatsappId) {
    throw new Error('Whatsapp ID not found in webhook payload');
  }

  let media: { serverUrl: string; twilioUrl: string; mimeType: string } | undefined;
  let content: MessageContent = [{ type: 'text', text }];
  if (numMedia === '1' && mediaUrl0 && mediaContentType0?.startsWith('image/')) {
    try {
      const serverUrl = await downloadTwilioMedia(mediaUrl0, whatsappId, mediaContentType0);
      content.push({ type: 'image_url', image_url: { url: serverUrl } });
      media = { serverUrl, twilioUrl: mediaUrl0, mimeType: mediaContentType0 };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          whatsappId,
          mediaUrl0,
        },
        'Failed to download image, proceeding without it.',
      );
    }
  }

  const { savedMessage, messages, pending: dbPending, selectedTonality: dbSelectedTonality } = await prisma.$transaction(async (tx) => {
    const [lastMessage, latestAssistantMessage] = await Promise.all([
      tx.message.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true, content: true },
      }),
      tx.message.findFirst({
        where: {
          conversation: { id: conversationId, userId: user.id },
          role: MessageRole.AI,
        },
        orderBy: { createdAt: 'desc' },
        select: { pending: true, selectedTonality: true }, // <-- now selecting selectedTonality
      }),
    ]);

    // Pull from DB
    const pendingStateDB = latestAssistantMessage?.pending ?? PendingType.NONE;
    const selectedTonalityDB = latestAssistantMessage?.selectedTonality ?? null;

    logger.debug({
      whatsappId,
      pendingStateDB,
      selectedTonalityDB,
      conversationId,
      graphRunId,
      buttonPayload,
      text,
    }, 'IngestMessage: Current pending, selectedTonality, and input');

    let savedMessage;
    if (lastMessage && lastMessage.role === MessageRole.USER) {
      const existingContent = lastMessage.content as MessageContent;
      const mergedContent = [...existingContent, ...content];

      savedMessage = await tx.message.update({
        where: { id: lastMessage.id },
        data: {
          content: mergedContent,
          ...(buttonPayload != null && { buttonPayload }),
          ...(media && {
            media: {
              create: {
                twilioUrl: media.twilioUrl,
                serverUrl: media.serverUrl,
                mimeType: media.mimeType,
              },
            },
          }),
        },
      });
    } else {
      savedMessage = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content,
          ...(buttonPayload != null && { buttonPayload }),
          ...(media && {
            media: {
              create: {
                twilioUrl: media.twilioUrl,
                serverUrl: media.serverUrl,
                mimeType: media.mimeType,
              },
            },
          }),
        },
      });
    }

    const messages = await tx.message
      .findMany({
        where: {
          conversationId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          role: true,
          content: true,
          buttonPayload: true,
          createdAt: true,
        },
      })
      .then((msgs) => msgs.reverse());

    // Return both pending and selectedTonality from DB (for fallback/merge)
    return { savedMessage, messages, pending: pendingStateDB, selectedTonality: selectedTonalityDB };
  });

  logger.debug({
    pending: state.pending ?? dbPending,
    selectedTonality: state.selectedTonality ?? dbSelectedTonality ?? null,
    messagesCount: messages.length,
  }, 'IngestMessage: Final state before returning');

  queueImageUpload(user.id, savedMessage.id);

  const conversationHistoryWithImages: (UserMessage | AssistantMessage)[] = [];
  const conversationHistoryTextOnly: (UserMessage | AssistantMessage)[] = [];

  for (const msg of messages) {
    const meta = {
      createdAt: msg.createdAt,
      messageId: msg.id,
      ...(msg.role === MessageRole.USER && {
        buttonPayload: msg.buttonPayload,
      }),
    };

    const contentWithImage = msg.content as MessageContent;
    const textContent = extractTextContent(contentWithImage);

    if (msg.role === MessageRole.USER) {
      const messageWithImage = new UserMessage(contentWithImage);
      messageWithImage.meta = meta;
      conversationHistoryWithImages.push(messageWithImage);

      const textOnlyMessage = new UserMessage(textContent);
      textOnlyMessage.meta = meta;
      conversationHistoryTextOnly.push(textOnlyMessage);
    } else {
      const assistantMessage = new AssistantMessage(textContent);
      assistantMessage.meta = meta;
      conversationHistoryWithImages.push(assistantMessage);
      conversationHistoryTextOnly.push(assistantMessage);
    }
  }

  logger.debug({ whatsappId, graphRunId }, 'Message ingested successfully');

  /**
   * The key: PREFER the latest computed state for pending/selectedTonality (from routing/handler).
   * Use fallback from DB only if handler did not provide them.
   */
  return {
    ...state,
    conversationHistoryWithImages,
    conversationHistoryTextOnly,
    pending: state.pending ?? dbPending, // prioritize latest logic/state
    selectedTonality: state.selectedTonality ?? dbSelectedTonality, // prioritize latest logic/state
    user,
    input,
  };
}
