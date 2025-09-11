import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { PendingType } from '@prisma/client';

import { invokeTextLLMWithJsonOutput } from '../../lib/llm';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { Replies } from '../state';
import { GraphState } from '../state';

/**
 * Schema for LLM output when asking user for profile information.
 */
const LLMOutputSchema = z.object({
  text: z.string().describe("The natural language sentence asking the user for the missing information.")
});

/**
 * Handles user onboarding by asking for missing profile information.
 * Generates a contextual response requesting the missing profile field (gender or age group)
 * and sets the conversation to pending state for the next user response.
 */
export async function askUserInfoNode(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  const messageId = state.input.MessageSid;

  logger.info({ userId, messageId, missingField: state.missingProfileField }, 'Asking user for missing profile information');

  try {
    const systemPrompt = await loadPrompt('ask_user_info.txt', { injectPersona: true });

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    const missingField = state.missingProfileField || 'required information';
    logger.debug({ userId, messageId, missingField }, 'Creating prompt for missing field request');

    const partialPrompt = await promptTemplate.partial({ missingField });
    const formattedPrompt = await partialPrompt.invoke({
      history: state.conversationHistoryTextOnly
    });

    const response = await invokeTextLLMWithJsonOutput(
      formattedPrompt.toChatMessages(),
      LLMOutputSchema,
    );

    const replies: Replies = [{ reply_type: 'text', reply_text: response.text }];
    logger.info({ userId, messageId, replyLength: response.text.length }, 'Successfully generated ask user info reply');
    return { ...state, assistantReply: replies, pending: PendingType.ASK_USER_INFO };
  } catch (err: any) {
    logger.warn({ userId, messageId, err: err.message }, 'Failed to generate ask user info response, using fallback');
    const replies: Replies = [{ reply_type: 'text', reply_text: "Sorry, I'm having a little trouble right now. Let's try again later." }];
    return { ...state, assistantReply: replies };
  }
}