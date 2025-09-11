import { AIMessage, HumanMessage, type MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { downloadTwilioMedia } from '../../utils/media';
import { getConversation } from '../../utils/conversation';
import { extractTextContent } from '../../utils/text';
import { logger } from '../../utils/logger';
import { GraphState } from '../state';

/**
 * Ingests incoming Twilio messages, processes media attachments, manages conversation history,
 * and prepares data for downstream processing in the agent graph.
 *
 * Handles message merging for multi-part messages, media download and storage,
 * and conversation history preparation with both image and text-only versions.
 */
export async function ingestMessageNode(state: GraphState): Promise<GraphState> {
  const { input, user } = state;
  const {
    Body: text,
    ButtonPayload: buttonPayload,
    NumMedia: numMedia,
    MediaUrl0: mediaUrl0,
    MediaContentType0: mediaContentType0,
    From: whatsappId,
    MessageSid: messageId
  } = input;


  let media: { serverUrl: string; twilioUrl: string; mimeType: string } | undefined;
  let content: MessageContent = [{ type: 'text', text }];
  if (numMedia === '1' && mediaUrl0 && mediaContentType0?.startsWith('image/')) {
    try {
      const serverUrl = await downloadTwilioMedia(mediaUrl0, whatsappId, mediaContentType0);
      content.push({ type: 'image_url', image_url: { url: serverUrl } });
      media = { serverUrl, twilioUrl: mediaUrl0, mimeType: mediaContentType0 };
    } catch (error) {
      logger.warn({ error, whatsappId, mediaUrl0 }, 'Failed to download image');
    }
  }

  const conversation = await getConversation(user.id);

  const [lastMessage, latestAssistantMessage] = await Promise.all([
    prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, content: true, pending: true }
    }),
    prisma.message.findFirst({
      where: { conversation: { userId: user.id }, role: MessageRole.AI },
      orderBy: { createdAt: 'desc' },
      select: { pending: true }
    })
  ]);

  const pending = latestAssistantMessage?.pending ?? PendingType.NONE;

  if (lastMessage && lastMessage.role === MessageRole.USER) {
    const existingContent = lastMessage.content as MessageContent[];
    const mergedContent = [...existingContent, ...content];

    await prisma.message.update({
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
      }
    });
  } else {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
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
      }
    });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
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
  });

  const conversationHistoryWithImages = messages.reverse().map((msg) => {
    if (msg.role === MessageRole.USER) {
      return new HumanMessage({
        content: msg.content as MessageContent,
        additional_kwargs: { createdAt: msg.createdAt, buttonPayload: msg.buttonPayload, messageId: msg.id }
      });
    } else {
      return new AIMessage({
        content: msg.content as MessageContent,
        additional_kwargs: { createdAt: msg.createdAt, messageId: msg.id }
      });
    }
  });

  const conversationHistoryTextOnly = conversationHistoryWithImages.map((msg) => {
    const textContent = extractTextContent(msg.content as MessageContent);

    if (msg instanceof HumanMessage) {
      return new HumanMessage({ content: textContent, additional_kwargs: msg.additional_kwargs });
    } else {
      return new AIMessage({ content: textContent, additional_kwargs: msg.additional_kwargs });
    }
  });

  logger.debug({ whatsappId, messageId }, 'Message ingested successfully');

  return {
    ...state,
    conversationHistoryWithImages,
    conversationHistoryTextOnly,
    pending,
    user,
    input,
  };
}