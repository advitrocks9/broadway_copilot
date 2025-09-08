import { prisma } from '../../lib/prisma';
import { getOrCreateUserByWaId } from '../../utils/user';
import { downloadTwilioMedia } from '../../utils/media';
import { getLogger } from '../../utils/logger';
import { HumanMessage, AIMessage, type MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType, User } from '@prisma/client';

const logger = getLogger('node:ingest_message');

/**
 * Extracts text content from message content, replacing images with [IMAGE] placeholders
 */
function extractTextContent(content: MessageContent): string {
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (part.type === 'image_url') {
          return '[IMAGE]';
        } else if (part.type === 'text') {
          return part.text;
        }
        return '';
      })
      .join(' ');
  }
  return content as string;
}

export async function ingestMessageNode(state: any): Promise<any> {

  const text = state.input.Body;
  const buttonPayload = state.input.ButtonPayload;
  const numMedia = state.input.NumMedia;
  const mediaUrl0 = state.input.MediaUrl0;
  const mediaContentType0 = state.input.MediaContentType0;
  const waId = state.input.From;

  logger.debug({
    waId,
    messageLength: text?.length,
    hasButtonPayload: !!buttonPayload,
    numMedia: Number(numMedia) || 0,
    hasMedia: !!mediaUrl0
  }, 'IngestMessage: processing incoming message');

  const user: User = await getOrCreateUserByWaId(waId);
  logger.debug({ waId, userId: user.id }, 'IngestMessage: user resolved');

  let content: MessageContent = [{ type: 'text', text }];
  if (numMedia == 1 && mediaUrl0 && mediaContentType0.startsWith('image/')) {
    try {
      const imagePath = await downloadTwilioMedia(mediaUrl0, waId, mediaContentType0);
      content.push({ type: 'image_url', image_url: { url: imagePath } });
    } catch (err) {
      logger.error({ err }, 'IngestMessage: failed to download/process media');
    }
  }

  const [lastMessage, latestAssistantMessage] = await Promise.all([
    prisma.message.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, role: true, content: true, pending: true }
    }),
    prisma.message.findFirst({
      where: {
        userId: user.id,
        role: MessageRole.AI
      },
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
        ...(buttonPayload !== null && { buttonPayload }),
        hasImage: true // since we're adding image
      }
    });
  } else {
    await prisma.message.create({
      data: {
        userId: user.id,
        role: MessageRole.USER,
        content,
        ...(buttonPayload !== null && { buttonPayload }),
        hasImage: numMedia > 0
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

  const conversationHistoryWithImages = messages.reverse().map((msg: any) => {
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

  const conversationHistoryTextOnly = conversationHistoryWithImages.map((msg: any) => {
    const textContent = extractTextContent(msg.content as MessageContent);

    if (msg instanceof HumanMessage) {
      return new HumanMessage({ content: textContent, additional_kwargs: msg.additional_kwargs });
    } else {
      return new AIMessage({ content: textContent, additional_kwargs: msg.additional_kwargs });
    }
  });

  logger.debug({
    waId,
    conversationHistoryLength: conversationHistoryWithImages.length,
    pending,
    userId: user.id
  }, 'IngestMessage: completed message processing');

  return {
    conversationHistoryWithImages,
    conversationHistoryTextOnly,
    pending,
    user,
    input: state.input
  };
}