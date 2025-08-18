import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../utils/llm';

/**
 * Handles general chat; may return text, menu, or card per prompt schema.
 */

export async function handleGeneralNode(state: { input: RunInput; messages?: unknown[]; intent?: string }): Promise<{ reply: { reply_type: 'text' | 'menu' | 'card'; reply_text: string } }>{
  const llm = getNanoLLM();
  const { input } = state;
  const messages = (state.messages as unknown[]) || [];
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_general.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (if known, tailor guidance and examples accordingly).` },
    { role: 'system', content: `Intent: ${intent || 'general'}` },
    { role: 'system', content: `Conversation: ${JSON.stringify(messages)}` },
    { role: 'user', content: input.text || 'Help with style.' },
  ];
  const Schema = z.object({ reply_type: z.enum(['text','menu','card']), reply_text: z.string() });
  console.log('💬 [GENERAL:INPUT]', { userText: input.text || '', lastTurns: messages.slice(-4) });
  const resp = await llm.withStructuredOutput(Schema).invoke(prompt);
  console.log('💬 [GENERAL:OUTPUT]', resp);
  const reply = { reply_type: resp.reply_type, reply_text: resp.reply_text } as const;
  return { reply };
}
