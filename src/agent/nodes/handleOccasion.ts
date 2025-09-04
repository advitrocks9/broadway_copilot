import { z } from 'zod';

import { Replies } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Crafts occasion-specific suggestions; outputs text reply_type.
 */
const logger = getLogger('node:handle_occasion');

const LLMOutputSchema = z.object({ message1_text: z.string(), message2_text: z.string().nullable() });

export async function handleOccasionNode(state: any): Promise<Replies>{
  const systemPrompt = await loadPrompt('handle_occasion.txt');
  
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistory || [] });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'HandleOccasion: output');
  const replies: Replies = [{ reply_type: 'text', reply_text: response.message1_text }];
  if (response.message2_text) replies.push({ reply_type: 'text', reply_text: response.message2_text });
  return replies;
}