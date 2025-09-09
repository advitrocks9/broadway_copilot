import { AIMessage, HumanMessage, type MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType, type User } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { createError } from '../../utils/errors';
import { downloadTwilioMedia } from '../../utils/media';
import { extractTextContent } from '../../utils/text';
import { getUser } from '../../utils/user';
import { logger } from '../../utils/logger';

/**
 * Ingests incoming Twilio messages, processes media attachments, manages conversation history,
 * and prepares data for downstream processing in the agent graph.
 *
 * Handles message merging for multi-part messages, media download and storage,
 * and conversation history preparation with both image and text-only versions.
 */
export async function ingestMessageNode(state: any): Promise<any> {
  const { input } = state;
  const {
    Body: text,
    ButtonPayload: buttonPayload,
    NumMedia: numMedia,
    MediaUrl0: mediaUrl0,
    MediaContentType0: mediaContentType0,
    From: waId,
    MessageSid: messageId
  } = input;

  if (!waId) {
    throw createError.badRequest('WhatsApp ID is required');
  }

  const user: User = await getUser(waId);

  let content: MessageContent = [{ type: 'text', text }];
  let hasImageInCurrent = false;
  if (numMedia === '1' && mediaUrl0 && mediaContentType0?.startsWith('image/')) {
    try {
      const imagePath = await downloadTwilioMedia(mediaUrl0, waId, mediaContentType0);
      content.push({ type: 'image_url', image_url: { url: imagePath } });
      hasImageInCurrent = true;
    } catch (error) {
      logger.warn({ error, waId, mediaUrl0 }, 'Failed to download image');
    }
  }

  const [lastMessage, latestAssistantMessage] = await Promise.all([
    prisma.message.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, content: true, pending: true, hasImage: true }
    }),
    prisma.message.findFirst({
      where: { userId: user.id, role: MessageRole.AI },
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
        hasImage: lastMessage.hasImage || hasImageInCurrent
      }
    });
  } else {
    await prisma.message.create({
      data: {
        userId: user.id,
        role: MessageRole.USER,
        content,
        ...(buttonPayload != null && { buttonPayload }),
        hasImage: hasImageInCurrent
      }
    });
  }

  const messages = await prisma.message.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
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

  logger.debug({ waId, messageId }, 'Message ingested successfully');

  return {
    conversationHistoryWithImages,
    conversationHistoryTextOnly,
    pending,
    user,
    input: state.input
  };
}