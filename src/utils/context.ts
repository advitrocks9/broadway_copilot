/**
 * @module context
 * @description User and conversation context management. Resolves active sessions, rotates
 * stale conversations after a configurable timeout, and builds structured context objects
 * for the agent graph from database records.
 */

import { Conversation, ConversationStatus, Prisma, User } from '@prisma/client';

import { BaseMessage } from '../lib/ai/core/messages';
import { prisma } from '../lib/prisma';
import { queueMemoryExtraction } from '../lib/tasks';
import { logger } from './logger';

const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

async function handleStaleConversation(
  user: User,
  conversation: Conversation,
): Promise<Conversation> {
  logger.debug(
    { userId: user.id, conversationId: conversation.id },
    'Stale conversation detected, closing and creating a new one.',
  );

  const [, newConversation] = await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: ConversationStatus.CLOSED },
    }),
    prisma.conversation.create({
      data: { userId: user.id },
    }),
  ]);

  queueMemoryExtraction(user.id, conversation.id);
  logger.debug(
    { userId: user.id, conversationId: conversation.id },
    'Queued memory extraction for closed conversation.',
  );

  return newConversation;
}

export async function getOrCreateUserAndConversation(
  whatsappId: string,
  profileName: string,
): Promise<{ user: User; conversation: Conversation }> {
  const updateData: Prisma.UserUpdateInput = {};
  const user = await prisma.user.upsert({
    where: { whatsappId },
    update: updateData,
    create: {
      whatsappId,
      profileName,
    },
  });

  const lastOpenConversation = await prisma.conversation.findFirst({
    where: {
      userId: user.id,
      status: ConversationStatus.OPEN,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (lastOpenConversation) {
    const timeSinceLastUpdate = Date.now() - new Date(lastOpenConversation.updatedAt).getTime();
    if (timeSinceLastUpdate > CONVERSATION_TIMEOUT_MS) {
      return {
        user,
        conversation: await handleStaleConversation(user, lastOpenConversation),
      };
    }
    return { user, conversation: lastOpenConversation };
  }

  logger.debug({ userId: user.id }, 'No open conversation found, creating a new one.');
  const newConversation = await prisma.conversation.create({
    data: { userId: user.id },
  });
  return { user, conversation: newConversation };
}

export function numImagesInMessage(conversationHistoryWithImages: BaseMessage[]): number {
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

  return latestMessage.content.filter((item) => item.type === 'image_url').length;
}
