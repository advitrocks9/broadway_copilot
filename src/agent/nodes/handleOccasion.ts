import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { callResponsesWithSchema } from '../../utils/openai';

/**
 * Crafts occasion-specific suggestions; outputs text reply_type.
 */

export async function handleOccasionNode(state: { input: RunInput; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_occasion.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (use this to tailor occasion-specific recommendations).` },
    { role: 'system', content: `Current user ID: ${input.userId}` },
    { role: 'system', content: `Intent: ${intent || 'occasion'}` },
    { role: 'user', content: input.text || 'Suggest an outfit for my occasion.' },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  console.log('🎯 [OCCASION:INPUT]', { userText: input.text || '' });
  const resp = await callResponsesWithSchema<{ reply_text: string; followup_text: string | null}>({
    messages: prompt as any,
    schema: Schema,
    model: 'gpt-5-nano',
  });
  console.log('🎯 [OCCASION:OUTPUT]', resp);
  if ((resp as any).__tool_calls) {
    const tc = (resp as any).__tool_calls;
    console.log('🎯 [OCCASION:TOOLS]', { total: tc.total, names: tc.names });
  }
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
