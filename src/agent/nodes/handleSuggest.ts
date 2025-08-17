import { ChatOpenAI } from '@langchain/openai';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';

/**
 * Suggests actionable style improvements; outputs text reply_type.
 */

export async function handleSuggestNode(state: { input: RunInput; messages?: unknown[]; intent?: string }): Promise<{ reply: { reply_type: 'text'; reply_text: string }; postAction: 'followup' }>{
  const llm = new ChatOpenAI({ model: 'gpt-5-nano', useResponsesApi: true , reasoning: { effort: "minimal" }  });
  const { input } = state;
  const messages = (state.messages as unknown[]) || [];
  const question = input.text || 'Suggestions to improve the outfit?';
  const intent: string | undefined = state.intent;
  const systemPrompt = loadPrompt('handle_suggest.txt');
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Intent: ${intent || 'suggest'}` },
    { role: 'system', content: `Conversation: ${JSON.stringify(messages)}` },
    { role: 'user', content: question },
  ];
  const Schema = z.object({ reply_text: z.string() });
  console.log('✨ [SUGGEST:INPUT]', { userText: question, lastTurns: messages.slice(-4) });
  const resp = await llm.withStructuredOutput(Schema).invoke(prompt);
  console.log('✨ [SUGGEST:OUTPUT]', resp);
  return { reply: { reply_type: 'text', reply_text: resp.reply_text }, postAction: 'followup' };
}
