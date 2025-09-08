import { z } from 'zod';

import { Replies } from '../state';
import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { fetchRelevantMemories } from '../tools';

const logger = getLogger('node:handle_general');

const LLMOutputSchema = z.object({
  reply_type: z.enum(['greeting', 'menu', 'chat']).describe("The type of reply to generate. Use 'greeting' for initial hellos, 'menu' if the user asks for help or what you can do, and 'chat' for conversational replies."),
  message1_text: z.string().describe("The primary text response to the user."),
  message2_text: z.string().nullable().describe("An optional second message to provide more details or continue the conversation."),
  
});

export async function handleGeneralNode(state: any) {

  const { conversationHistoryTextOnly, userId } = state;

  const latestMessage = conversationHistoryTextOnly.at(-1)?.content ?? '';

  let formattedMemories = 'No relevant memories.';

  try {

    const memories = await fetchRelevantMemories.func({ userId, query: latestMessage });

    if (memories.length > 0) {

      formattedMemories = memories.map(m => `${m.category}: ${m.key} = ${m.value} (confidence: ${m.confidence ?? 'N/A'}, updated: ${m.updatedAt.toISOString()})`).join('\n');

    }

  } catch (err) {

    logger.warn({ err }, 'Failed to fetch memories');

  }

  const systemPrompt = await loadPrompt('handle_general.txt', { injectPersona: true });

  const enhancedPrompt = `${systemPrompt}\n\nRelevant User Memories:\n${formattedMemories}`;

  const availableActions = [
    { text: 'Vibe check', id: 'vibe_check' },
    { text: 'Color analysis', id: 'color_analysis' },
    { text: 'Styling', id: 'styling' },
  ]
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", enhancedPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistoryTextOnly || [] });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.debug({ replyType: response.reply_type }, 'HandleGeneral: generated response');
  const replies: Replies = [];

  if (response.reply_type === 'greeting') {
    replies.push({ reply_type: 'image', media_url: WELCOME_IMAGE_URL });
    replies.push({ reply_type: 'quick_reply', reply_text: response.message1_text, buttons: availableActions, });
  } else if (response.reply_type === 'menu') {
    replies.push({ reply_type: 'quick_reply', reply_text: response.message1_text, buttons: availableActions, });
  } else if (response.reply_type === 'chat') {
    replies.push({ reply_type: 'text', reply_text: response.message1_text });
    if (response.message2_text) replies.push({ reply_type: 'text', reply_text: response.message2_text });
  }
  return { assistantReply: replies };
}
