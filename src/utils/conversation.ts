import { Conversation, ConversationStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { queueMemoryExtraction } from '../lib/tasks';
import { logger } from './logger';
import { InternalServerError } from './errors';

const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Retrieves the current open conversation for a user or creates a new one.
 * If the latest open conversation is older than the timeout period, it closes it
 * and creates a new one to prevent stale context.
 *
 * @param userId - The ID of the user.
 * @returns The active conversation for the user.
 */
export async function getConversation(userId: string): Promise<Conversation> {
  try {
    const lastOpenConversation = await prisma.conversation.findFirst({
      where: { userId, status: ConversationStatus.OPEN },
      orderBy: { updatedAt: 'desc' },
    });

    if (lastOpenConversation) {
      const timeSinceLastUpdate = Date.now() - new Date(lastOpenConversation.updatedAt).getTime();
      if (timeSinceLastUpdate > CONVERSATION_TIMEOUT_MS) {
        logger.debug(
          { userId, conversationId: lastOpenConversation.id },
          'Stale conversation detected, closing and creating a new one.'
        );
        await prisma.conversation.update({
          where: { id: lastOpenConversation.id },
          data: { status: ConversationStatus.CLOSED },
        });
        if (process.env.NODE_ENV === 'production') {
          await queueMemoryExtraction(userId, lastOpenConversation.id);
          logger.debug(
            { userId, conversationId: lastOpenConversation.id },
            'Queued memory extraction for closed conversation.'
          );
        }

      } else {
        return lastOpenConversation;
      }
    }

    logger.debug({ userId }, 'No open conversation found, creating a new one.');
    return prisma.conversation.create({
      data: { userId },
    });
  } catch (err: unknown) {
    throw new InternalServerError('Failed to get or create conversation', { cause: err });
  }
}

/**
 * Counts the number of image attachments in the most recent message.
 * Used to determine if image processing features should be triggered.
 *
 * @param conversationHistoryWithImages - Array of conversation messages with image data
 * @returns Number of image URLs in the latest message
 */
export function numImagesInMessage(conversationHistoryWithImages: any[]): number {
  if (!conversationHistoryWithImages || conversationHistoryWithImages.length === 0) {
    return 0;
  }

  const latestMessage = conversationHistoryWithImages.at(-1);
  if (!latestMessage || !latestMessage.content) {
    return 0;
  }

  if (!Array.isArray(latestMessage.content)) {
    return 0;
  }

  return latestMessage.content.filter((item: any) => item.type === 'image_url').length;
}
