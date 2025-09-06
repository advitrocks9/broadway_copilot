import { z } from 'zod';

import { Replies } from '../state';
import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Provides vacation-specific guidance; outputs text reply_type.
 */
const logger = getLogger('node:handle_vacation');

const LLMOutputSchema = z.object({
  message1_text: z.string().describe("The main message containing vacation-specific styling advice and outfit recommendations."),
  message2_text: z.string().nullable().describe("An optional, short follow-up message to suggest a next step, like a Vibe Check or Color Analysis.")
});

export async function handleVacationNode(state: any) {
  const systemPrompt = await loadPrompt('handle_vacation.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistoryTextOnly || [] });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'HandleVacation: output');
  const replies: Replies = [{ reply_type: 'text', reply_text: response.message1_text }];
  if (response.message2_text) replies.push({ reply_type: 'text', reply_text: response.message2_text });
  return { ...state, assistantReply: replies };
}
