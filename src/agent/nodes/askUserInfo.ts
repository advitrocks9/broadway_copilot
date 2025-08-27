import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../services/openaiService';
import { getLogger } from '../../utils/logger';

/**
 * Asks the user for required profile fields and returns a text reply.
 */
const logger = getLogger('node:ask_user_info');

export async function askUserInfoNode(state: { input: RunInput; messages?: unknown[]; missingProfileFields?: Array<'gender'> }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const llm = getNanoLLM();
  const { input } = state;
  const missing: Array<'gender'> = state.missingProfileFields || [];
  const convo = (state.messages as unknown[]) || [];

  const system = await loadPrompt('ask_user_info.txt');
  const list = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const promptMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(convo)}` },
    { role: 'user', content: `Missing Fields: ${JSON.stringify({ fields: list })}` },
  ];
  const AskSchema = z.object({ text: z.string() });
  logger.info({ userId: input.userId, missing }, 'AskUserInfo: input');
  console.log('🤖 AskUserInfo Model Input:', JSON.stringify(promptMessages, null, 2));
  const resp = await llm.withStructuredOutput(AskSchema as any).invoke(promptMessages) as { text: string };
  logger.info(resp, 'AskUserInfo: output');
  const replyText = resp.text;
  return { replies: [{ reply_type: 'text', reply_text: replyText }] };
}