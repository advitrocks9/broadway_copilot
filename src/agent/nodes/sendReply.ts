import 'dotenv/config';

import { MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { queueMemoryExtraction } from '../../lib/tasks';
import { sendText, sendMenu, sendImage } from '../../lib/twilio';
import { logger }  from '../../utils/logger';
import { createError, normalizeError } from '../../utils/errors';
import { Replies } from '../state';

/**
 * Sends the reply via Twilio based on the assistant's generated replies.
 * Records the assistant's message in the database and updates processing status.
 * Schedules memory extraction after sending.
 * @param state The current agent state containing reply and user info.
 * @returns An empty object as no state updates are needed.
 */
export async function sendReplyNode(state: any): Promise<Record<string, never>> {
  const { input, user } = state;
  const messageId = input?.MessageSid as string | undefined;
  if (!messageId) {
    throw createError.badRequest('MessageSid is required');
  }
  const messageKey = `message:${messageId}`;
  const userId = user.id;
  const waId = user.waId;

  logger.debug({ waId }, 'Setting message status to sending in Redis');
  await redis.hSet(messageKey, { status: 'sending' });

  const replies: Replies = state.assistantReply;
  const formattedContent: MessageContent = replies.flatMap(r => {
    const parts: MessageContent = [];
    if (r.reply_text) {
      parts.push({ type: 'text', text: r.reply_text });
    }
    if (r.reply_type === 'image') {
      parts.push({ type: 'image_url', image_url: { url: r.media_url } });
    }
    return parts;
  });

  const pendingToPersist = (state.pending as PendingType | undefined) ?? PendingType.NONE;

  await prisma.message.create({
    data: {
      userId,
      role: MessageRole.AI,
      content: formattedContent,
      pending: pendingToPersist,
    }
  });

  let success = true;
  try {
    for (const [index, r] of replies.entries()) {
      if (r.reply_type === 'text') {
        await sendText(waId, r.reply_text);
        logger.debug({ waId, replyIndex: index + 1, textLength: r.reply_text.length }, 'Sent text message');
      } else if (r.reply_type === 'quick_reply') {
        await sendMenu(waId, r.reply_text, r.buttons);
        logger.debug({ waId, replyIndex: index + 1, buttonCount: r.buttons?.length }, 'Sent menu message');
      } else if (r.reply_type === 'image') {
        await sendImage(waId, r.media_url, r.reply_text);
        logger.debug({ waId, replyIndex: index + 1, mediaUrl: r.media_url }, 'Sent image message');
      }
    }
    logger.info({ waId, replyCount: replies.length }, 'All replies sent successfully');
  } catch (err: unknown) {
    success = false;
    const normalized = normalizeError(err);
    throw createError.internalServerError('Failed to send replies', { cause: normalized });
  } finally {
    logger.debug({ status: success ? 'delivered' : 'failed' }, 'Updating message status in Redis');
    await redis.hSet(messageKey, { status: success ? 'delivered' : 'failed' });

    try {
      logger.debug({ waId }, 'Scheduling memory extraction for user');
      await queueMemoryExtraction(userId, 5 * 60 * 1000);
      logger.debug({ waId }, 'Scheduled memory extraction');
    } catch (err: unknown) {
      logger.warn({ waId, err: (err as Error).message, stack: (err as Error).stack }, 'Failed to schedule memory extraction');
    }
  }

  return {};
}