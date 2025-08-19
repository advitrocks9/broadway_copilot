import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { callResponsesWithSchema } from '../../utils/openai';

/**
 * Suggests actionable style improvements; outputs text reply_type.
 */

export async function handleSuggestNode(state: { input: RunInput; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const question = input.text || 'Suggestions to improve the outfit?';
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_suggest.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (recommendations should reflect this when relevant).` },
    { role: 'system', content: `Current user ID: ${input.userId}` },
    { role: 'system', content: `Intent: ${intent || 'suggest'}` },
    { role: 'user', content: question },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  console.log('✨ [SUGGEST:INPUT]', { userText: question });
  const resp = await callResponsesWithSchema<{ reply_text: string; followup_text: string | null}>({
    messages: prompt as any,
    schema: Schema,
    model: 'gpt-5-nano',
  });
  console.log('✨ [SUGGEST:OUTPUT]', resp);
  if ((resp as any).__tool_calls) {
    const tc = (resp as any).__tool_calls;
    console.log('✨ [SUGGEST:TOOLS]', { total: tc.total, names: tc.names });
  }
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
