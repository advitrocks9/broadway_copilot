import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { callResponsesWithSchema } from '../../utils/openai';

/**
 * Asks the user for required profile fields and returns a text reply.
 */

export async function askUserInfoNode(state: { input: RunInput; intent?: string; missingProfileFields?: Array<'gender'> }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const missing: Array<'gender'> = state.missingProfileFields || [];
  const intent: string | undefined = state.intent;

  const system = loadPrompt('ask_user_info.txt');
  const list = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const promptMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: system },
    { role: 'system', content: `Intent: ${intent || 'general'}` },
    { role: 'user', content: JSON.stringify({ fields: list }) },
  ];
  const AskSchema = z.object({ text: z.string() });
  console.log('🧩 [ASK_USER_INFO:INPUT]', { userId: input.userId, missing });
  const resp = await callResponsesWithSchema<{ text: string }>({
    messages: promptMessages as any,
    schema: AskSchema,
    model: 'gpt-5-nano',
  });
  console.log('🧩 [ASK_USER_INFO:OUTPUT]', resp);
  if ((resp as any).__tool_calls) {
    const tc = (resp as any).__tool_calls;
    console.log('🧩 [ASK_USER_INFO:TOOLS]', { total: tc.total, names: tc.names });
  }
  const replyText = resp.text;
  return { replies: [{ reply_type: 'text', reply_text: replyText }] };
}
