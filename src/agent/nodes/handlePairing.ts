import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { callResponsesWithSchema } from '../../utils/openai';

/**
 * Suggests complementary pairing tags; outputs text reply_type.
 */

export async function handlePairingNode(state: { input: RunInput; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const question = input.text || 'How to pair items?';
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_pairing.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (choose examples and fits appropriate to gender).` },
    { role: 'system', content: `Current user ID: ${input.userId}` },
    { role: 'system', content: `Intent: ${intent || 'pairing'}` },
    { role: 'user', content: question },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  console.log('🧩 [PAIRING:INPUT]', { userText: question });
  const resp = await callResponsesWithSchema<{ reply_text: string; followup_text: string | null}>({
    messages: prompt as any,
    schema: Schema,
    model: 'gpt-5-nano',
  });
  console.log('🧩 [PAIRING:OUTPUT]', resp);
  if ((resp as any).__tool_calls) {
    const tc = (resp as any).__tool_calls;
    console.log('🧩 [PAIRING:TOOLS]', { total: tc.total, names: tc.names });
  }
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
