import 'dotenv/config';

import { MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { sendText, sendMenu, sendImage } from '../../lib/twilio';
import { logger } from '../../utils/logger';
import { createError, normalizeError } from '../../utils/errors';
import { Replies } from '../state';
import { GraphState } from '../state';
import { ConversationStatus } from '@prisma/client';

/**
 * Sends the reply via Twilio based on the assistant's generated replies.
 * Records the assistant's message in the database and updates processing status.
 * Schedules memory extraction after sending.
 * @param state The current agent state containing reply and user info.
 * @returns An empty object as no state updates are needed.
 */
export async function sendReplyNode(state: GraphState): Promise<GraphState> {
  const { input, user } = state;
  const messageId = input.MessageSid;
  const messageKey = `message:${messageId}`;
  const whatsappId = user.whatsappId;

  const conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, status: ConversationStatus.OPEN },
    orderBy: { createdAt: 'desc' },
  });

  if (!conversation) {
    throw createError.internalServerError('No open conversation found for user');
  }

  logger.debug({ whatsappId }, 'Setting message status to sending in Redis');
  await redis.hSet(messageKey, { status: 'sending' });

  const replies: Replies = state.assistantReply ?? [];
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
      conversationId: conversation.id,
      role: MessageRole.AI,
      content: formattedContent,
      pending: pendingToPersist,
    }
  });

  let success = true;
  try {
    for (const [index, r] of replies.entries()) {
      if (r.reply_type === 'text') {
        await sendText(whatsappId, r.reply_text);
        logger.debug({ whatsappId, replyIndex: index + 1, textLength: r.reply_text.length }, 'Sent text message');
      } else if (r.reply_type === 'quick_reply') {
        await sendMenu(whatsappId, r.reply_text, r.buttons);
        logger.debug({ whatsappId, replyIndex: index + 1, buttonCount: r.buttons?.length }, 'Sent menu message');
      } else if (r.reply_type === 'image') {
        await sendImage(whatsappId, r.media_url, r.reply_text);
        logger.debug({ whatsappId, replyIndex: index + 1, mediaUrl: r.media_url }, 'Sent image message');
      }
    }
    logger.info({ whatsappId, replyCount: replies.length }, 'All replies sent successfully');
  } catch (err: unknown) {
    success = false;
    const normalized = normalizeError(err);
    throw createError.internalServerError('Failed to send replies', { cause: normalized });
  } finally {
    logger.debug({ status: success ? 'delivered' : 'failed' }, 'Updating message status in Redis');
    await redis.hSet(messageKey, { status: success ? 'delivered' : 'failed' });
  }

  return { ...state };
}