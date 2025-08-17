import { ChatOpenAI } from '@langchain/openai';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';

/**
 * Crafts occasion-specific suggestions; outputs text reply_type.
 */

export async function handleOccasionNode(state: { input: RunInput; messages?: unknown[]; intent?: string }): Promise<{ reply: { reply_type: 'text'; reply_text: string }; postAction: 'followup' }>{
  const llm = new ChatOpenAI({ model: 'gpt-5-nano', useResponsesApi: true , reasoning: { effort: "minimal" } });
  const { input } = state;
  const messages = (state.messages as unknown[]) || [];
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_occasion.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Intent: ${intent || 'occasion'}` },
    { role: 'system', content: `Conversation: ${JSON.stringify(messages)}` },
    { role: 'user', content: input.text || 'Suggest an outfit for my occasion.' },
  ];
  const Schema = z.object({ reply_text: z.string() });
  console.log('🎯 [OCCASION:INPUT]', { userText: input.text || '', lastTurns: messages.slice(-4) });
  const resp = await llm.withStructuredOutput(Schema).invoke(prompt);
  console.log('🎯 [OCCASION:OUTPUT]', resp);
  return { reply: { reply_type: 'text', reply_text: resp.reply_text }, postAction: 'followup' };
}
