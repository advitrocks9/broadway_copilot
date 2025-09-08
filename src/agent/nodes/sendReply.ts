import 'dotenv/config';

import { prisma } from '../../lib/prisma';
import { sendText, sendMenu, sendImage } from '../../services/twilioService';
import { getLogger } from '../../utils/logger';
import { MessageRole } from '@prisma/client';
import { MessageContent } from '@langchain/core/messages';
import { redis } from '../../lib/redis';
import { scheduleMemoryExtractionForUser } from '../../services/memoryService';

/**
 * Sends the reply via Twilio based on state.reply and state.mode.
 * Also records assistant turn and updates intent if present.
 */
const logger = getLogger('node:send_reply');


export async function sendReplyNode(state: any): Promise<{}> {
  const messageKey = `message:${state.input.MessageSid}`;
  await redis.hSet(messageKey, { status: 'sending' });

  const replies = state.assistantReply;
  const userId = state.user.id;
  const waId = state.user.waId;

  logger.info({
    messageId: state.input.MessageSid,
    userId,
    waId,
    replyCount: replies.length
  }, 'Sending replies to user');

  logger.debug({
    messageId: state.input.MessageSid,
    replies: replies.map((r: any) => ({ type: r.reply_type, hasMedia: !!r.media_url }))
  }, 'SendReply: reply details');

  const formattedContent: MessageContent = [];
  for (const r of replies) {
    if (r.reply_type === 'text' || r.reply_type === 'quick_reply') {
      formattedContent.push({ type: 'text', text: r.reply_text });
    } else if (r.reply_type === 'image') {
      if (r.reply_text) {
        formattedContent.push({ type: 'text', text: r.reply_text });
      }
      formattedContent.push({ type: 'image_url', image_url: { url: r.media_url } });
    }
  }
  
  await prisma.message.create({ 
    data: {
      userId,
      role: MessageRole.AI,
      content: formattedContent,
    }
  });

  let success = true;
  try {
    for (const r of replies) {
      if (r.reply_type === 'text') {
        await sendText(waId, r.reply_text);
        logger.debug({ messageId: state.input.MessageSid, waId }, 'SendReply: sent text message');
      } else if (r.reply_type === 'quick_reply') {
        await sendMenu(waId, r.reply_text, r.buttons);
        logger.debug({ messageId: state.input.MessageSid, waId, buttonCount: r.buttons?.length }, 'SendReply: sent menu message');
      } else if (r.reply_type === 'image') {
        await sendImage(waId, r.media_url, r.reply_text);
        logger.debug({ messageId: state.input.MessageSid, waId, mediaUrl: r.media_url }, 'SendReply: sent image message');
      }
    }
    logger.info({ messageId: state.input.MessageSid, userId, waId }, 'All replies sent successfully');
  } catch (err) {
    logger.error({
      messageId: state.input.MessageSid,
      userId,
      waId,
      err: (err as Error)?.message
    }, 'Failed to send replies');
    success = false;
  }

  await redis.hSet(messageKey, { status: success ? 'delivered' : 'failed' });
  logger.debug({ messageId: state.input.MessageSid, status: success ? 'delivered' : 'failed' }, 'SendReply: updated message status');

  try {
    await scheduleMemoryExtractionForUser(userId, 5 * 60 * 1000);
  } catch (err: any) {
    logger.warn({ userId, err: err?.message }, 'Failed to schedule memory extraction');
  }

  return {};
}