import { z } from 'zod';

import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Asks the user for required profile fields and returns a text reply.
 */
const logger = getLogger('node:ask_user_info');

const LLMOutputSchema = z.object({ text: z.string() });

export async function askUserInfoNode(state: any): Promise<Replies>{
  const systemPrompt = await loadPrompt('ask_user_info.txt');
  
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const partialPrompt = await promptTemplate.partial({
    missingField: state.missingProfileField || 'required information'
  });

  const formattedPrompt = await partialPrompt.invoke({ history: state.conversationHistory || [] });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'AskUserInfo: output');
  const replies: Replies = [{ reply_type: 'text', reply_text: response.text }];
  return replies;
}