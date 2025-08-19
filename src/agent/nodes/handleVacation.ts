import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../utils/llm';

/**
 * Provides vacation-specific guidance; outputs text reply_type.
 */

export async function handleVacationNode(state: { input: RunInput; messages?: unknown[]; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const llm = getNanoLLM();
  const { input } = state;
  const messages = (state.messages as unknown[]) || [];
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_vacation.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (tailor vacation packing and style to gender).` },
    { role: 'system', content: `Intent: ${intent || 'vacation'}` },
    { role: 'system', content: `Conversation: ${JSON.stringify(messages)}` },
    { role: 'user', content: input.text || 'I need vacation outfit ideas.' },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  console.log('🌴 [VACATION:INPUT]', { userText: input.text || '', lastTurns: messages.slice(-4) });
  const resp = await llm.withStructuredOutput(Schema).invoke(prompt);
  console.log('🌴 [VACATION:OUTPUT]', resp);
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
