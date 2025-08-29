import 'dotenv/config';

import prisma from '../../db/client';
import type { Reply } from '../state';
import { sendText, sendMenu, sendImage } from '../../services/twilioService';
import { getLatestGen, sanitizeUserKey } from '../../services/runtimeState';
import { getLogger } from '../../utils/logger';

/**
 * Sends the reply via Twilio based on state.reply and state.mode.
 * Also records assistant turn and updates intent if present.
 */
const logger = getLogger('node:send_reply');

interface SendReplyInput {
  waId: string;
  userId: string;
  runGen?: number;
}

interface SendReplyState {
  input?: SendReplyInput;
  reply?: Reply | string;
  replies?: Array<Reply | string>;
  intent?: string;
}

interface SendReplyResult extends Record<string, never> {}

export async function sendReplyNode(state: SendReplyState): Promise<SendReplyResult> {
  const input = state.input;
  const waId = input?.waId;
  const userId = input?.userId;
  const runGen = input?.runGen;
  const replyObj: Reply | string | undefined = state.reply;
  const repliesArray: Array<Reply | string> | undefined = state.replies;
  const intent: string | undefined = state.intent;

  const collected = Array.isArray(repliesArray) && repliesArray.length > 0 ? repliesArray : (replyObj ? [replyObj] : []);
  if (!waId || !userId || collected.length === 0) {
    return {};
  }

  if (waId && typeof runGen === 'number') {
    const latest = getLatestGen(waId);
    if (latest && latest !== runGen) return {};
  }

  const normalizedReplies: Reply[] = collected.slice(0, 2).map(r => typeof r === 'string' ? { reply_type: 'text' as const, reply_text: r } : r);

  const createData = {
    userId: userId,
    role: 'assistant',
    text: normalizedReplies.map(r => r.reply_type === 'image' ? r.reply_text || '' : r.reply_text).join('\n\n'),
    intent: intent || null,
    metadata: { engine: 'langgraph' },
    replies: normalizedReplies,
  };
  const assistantTurn = await prisma.turn.create({ data: createData as any });
  logger.info({ userId, waId, turnId: assistantTurn.id, repliesCount: normalizedReplies.length, intent }, 'SendReply: persisted assistant turn');

  try {
    for (const r of normalizedReplies) {
      if (r.reply_type === 'text') {
        await sendText(waId, r.reply_text);
      } else if (r.reply_type === 'quick_reply') {
        await sendMenu(waId, r.reply_text, r.buttons);
      } else if (r.reply_type === 'image') {
        await sendImage(waId, r.media_url, r.reply_text);
      }
    }
  } catch (err) {
    logger.error({ err }, 'SendReply: Twilio send failed');
  }

  return {};
}