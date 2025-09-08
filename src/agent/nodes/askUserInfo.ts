import { z } from 'zod';

import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Asks the user for required profile fields and returns a text reply.
 */
const logger = getLogger('node:ask_user_info');

const LLMOutputSchema = z.object({ text: z.string().describe("The sentence asking the user for the missing information.") });

export async function askUserInfoNode(state: any) {
  const systemPrompt = await loadPrompt('ask_user_info.txt', { injectPersona: true });

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const partialPrompt = await promptTemplate.partial({
    missingField: state.missingProfileField || 'required information'
  });

  const formattedPrompt = await partialPrompt.invoke({ history: state.conversationHistoryWithTextOnly || [] });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.debug({ missingField: state.missingProfileField }, 'AskUserInfo: generated response');
  const replies: Replies = [{ reply_type: 'text', reply_text: response.text }];
  return { ...state, assistantReply: replies };
}