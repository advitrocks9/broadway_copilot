import 'dotenv/config';
import prisma from '../../db/client';
import { sendText, sendMenu, sendCard } from '../../services/twilioService';
import type { Reply } from '../state';

/**
 * Sends the reply via Twilio based on state.reply and state.mode.
 * Also records assistant turn and updates intent if present.
 */
type SendReplyState = {
  input?: { waId: string; userId: string };
  reply?: Reply | string;
  replies?: Array<Reply | string>;
  intent?: string;
};

export async function sendReplyNode(state: SendReplyState): Promise<Record<string, never>> {
  const input = state.input;
  const waId = input?.waId;
  const userId = input?.userId;
  const replyObj: Reply | string | undefined = state.reply;
  const repliesArray: Array<Reply | string> | undefined = state.replies;
  const intent: string | undefined = state.intent;

  const collected = Array.isArray(repliesArray) && repliesArray.length > 0 ? repliesArray : (replyObj ? [replyObj] : []);
  if (!waId || !userId || collected.length === 0) {
    return {};
  }

  

  const normalizedReplies: Reply[] = collected.slice(0, 2).map(r => typeof r === 'string' ? { reply_type: 'text', reply_text: r } : r);

  const createData: any = {
    userId: userId,
    role: 'assistant',
    text: normalizedReplies.map(r => r.reply_text).join('\n\n'),
    intent: intent || null,
    metadata: { engine: 'langgraph' },
    replies: normalizedReplies,
  };
  const assistantTurn = await prisma.turn.create({ data: createData });

  try {
    for (const r of normalizedReplies) {
      if (r.reply_type === 'text') {
        await sendText(waId, r.reply_text);
      } else if (r.reply_type === 'menu') {
        await sendMenu(waId, r.reply_text);
      } else if (r.reply_type === 'card') {
        await sendCard(waId, r.reply_text);
      }
    }
  } catch (err) {
    console.error('❌ [SEND_REPLY] Twilio send failed:', err);
  }

  return {};
}


