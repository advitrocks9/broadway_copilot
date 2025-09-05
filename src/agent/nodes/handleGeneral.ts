import { z } from 'zod';

import { Replies } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { SERVICES, WELCOME_IMAGE_URL } from '../../utils/constants';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Handles general chat; may return text, menu, or card per prompt schema.
 */
const LLMOutputSchema = z.object({
  reply_type: z.enum(['greeting', 'menu', 'chat']).describe("The type of reply to generate. Use 'greeting' for initial hellos, 'menu' if the user asks for help or what you can do, and 'chat' for conversational replies."),
  message1_text: z.string().describe("The primary text response to the user."),
  message2_text: z.string().nullable().describe("An optional second message to provide more details or continue the conversation."),
  
});

export async function handleGeneralNode(state: any) {

  let availableActions = SERVICES;
  if (state.user.lastColorAnalysisAt && new Date(state.user.lastColorAnalysisAt) < new Date(Date.now() - 1000 * 60 * 60 * 24)) {
    availableActions.push({ text: 'Color Analysis', id: 'color_analysis' });
  }
  if (state.user.lastVibeCheckAt && new Date(state.user.lastVibeCheckAt) < new Date(Date.now() - 1000 * 60 * 60 * 24)) {
    availableActions.push({ text: 'Vibe Check', id: 'vibe_check' });
  }
  
  availableActions = availableActions.slice(0, 3);

  const systemPrompt = await loadPrompt('handle_general.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistory || [] });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  const replies: Replies = [];

  if (response.reply_type === 'greeting') {
    replies.push({ reply_type: 'image', media_url: WELCOME_IMAGE_URL });
    replies.push({ reply_type: 'quick_reply', reply_text: response.message1_text, buttons: availableActions, });
  } else if (response.reply_type === 'menu') {
    replies.push({ reply_type: 'quick_reply', reply_text: response.message1_text, buttons: availableActions, });
  } else if (response.reply_type === 'chat') {
    replies.push({ reply_type: 'text', reply_text: response.message1_text });
    if (response.message2_text) replies.push({reply_type:'text', reply_text: response.message2_text});
  }
  return { assistantReply: replies };
}
