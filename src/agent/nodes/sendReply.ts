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
  intent?: string;
  userTurnId?: string;
};

export async function sendReplyNode(state: SendReplyState): Promise<{ messages?: Array<{ id: string; role: 'assistant'; text: string | null; intent: string | null; mode: Reply['reply_type']; createdAt: Date }> }> {
  const input = state.input;
  const waId = input?.waId;
  const userId = input?.userId;
  const replyObj: Reply | string | undefined = state.reply;
  const intent: string | undefined = state.intent;
  const userTurnId: string | undefined = state.userTurnId;

  if (!waId || !userId || !replyObj) {
    return {};
  }

  if (userTurnId && intent) {
    await prisma.turn.update({ where: { id: userTurnId }, data: { intent } }).catch(() => {});
  }

  const normalizedReply: Reply =
    typeof replyObj === 'string'
      ? { reply_type: 'text', reply_text: replyObj }
      : replyObj;

  const assistantTurn = await prisma.turn.create({
    data: {
      userId: userId,
      role: 'assistant',
      text: normalizedReply.reply_text,
      intent: intent || null,
      metadata: { engine: 'langgraph' },
    },
  });

  try {
    if (normalizedReply.reply_type === 'text') {
      await sendText(waId, normalizedReply.reply_text);
    } else if (normalizedReply.reply_type === 'menu') {
      await sendMenu(waId, normalizedReply.reply_text);
    } else if (normalizedReply.reply_type === 'card') {
      await sendCard(waId, normalizedReply.reply_text);
    }
  } catch (err) {
    console.error('❌ [SEND_REPLY] Twilio send failed:', err);
  }

  return { messages: [
    { id: assistantTurn.id, role: 'assistant', text: assistantTurn.text, intent: intent || null, mode: normalizedReply.reply_type, createdAt: assistantTurn.createdAt },
  ] };
}


