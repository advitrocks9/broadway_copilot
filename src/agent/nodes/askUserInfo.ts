import { ChatOpenAI } from '@langchain/openai';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';

/**
 * Asks the user for required profile fields and returns a text reply.
 */

export async function askUserInfoNode(state: { input: RunInput; messages?: unknown[]; intent?: string; missingProfileFields?: Array<'gender'> }): Promise<{ reply: { reply_type: 'text'; reply_text: string } }>{
  const llm = new ChatOpenAI({ model: 'gpt-5-nano', useResponsesApi: true , reasoning: { effort: "minimal" }  });
  const { input } = state;
  const missing: Array<'gender'> = state.missingProfileFields || [];
  const convo = (state.messages as unknown[]) || [];
  const intent: string | undefined = state.intent;

  const system = loadPrompt('ask_user_info.txt');
  const list = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const promptMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: system },
    { role: 'system', content: `Intent: ${intent || 'general'}` },
    { role: 'user', content: JSON.stringify({ fields: list, conversation: convo }) },
  ];
  const AskSchema = z.object({ text: z.string() });
  console.log('🧩 [ASK_USER_INFO:INPUT]', { userId: input.userId, missing });
  const resp = await llm.withStructuredOutput(AskSchema).invoke(promptMessages);
  console.log('🧩 [ASK_USER_INFO:OUTPUT]', resp);
  const replyText = resp.text;
  return { reply: { reply_type: 'text', reply_text: replyText } };
}
