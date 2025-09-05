import { z } from 'zod';

import { Replies } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Suggests complementary pairing tags; outputs text reply_type.
 */
const logger = getLogger('node:handle_pairing');

const LLMOutputSchema = z.object({
  message1_text: z.string().describe("The main message containing styling advice for pairing clothing items."),
  message2_text: z.string().nullable().describe("An optional, short follow-up message to suggest next steps or ask a question.")
});

export async function handlePairingNode(state: any) {
  const systemPrompt = await loadPrompt('handle_pairing.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistory || [] });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'HandlePairing: output');
  const replies: Replies = [{ reply_type: 'text', reply_text: response.message1_text }];
  if (response.message2_text) replies.push({ reply_type: 'text', reply_text: response.message2_text });
  return { ...state, assistantReply: replies };
}
