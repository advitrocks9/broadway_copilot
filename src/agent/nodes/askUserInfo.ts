import { z } from 'zod';

import { PendingType } from '@prisma/client';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { InternalServerError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState, Replies } from '../state';

/**
 * Schema for LLM output when asking user for profile information.
 */
const LLMOutputSchema = z.object({
  text: z
    .string()
    .describe('The natural language sentence asking the user for the missing information.'),
});

/**
 * Handles user onboarding by asking for missing profile information.
 * Generates a contextual response requesting the missing profile field (gender or age group)
 * and sets the conversation to pending state for the next user response.
 */
export async function askUserInfo(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  const messageId = state.input.MessageSid;

  logger.debug(
    { userId, messageId, missingField: state.missingProfileField },
    'Asking user for missing profile information',
  );

  try {
    const systemPromptText = await loadPrompt('data/ask_user_info.txt');

    const missingField = state.missingProfileField || 'required information';
    logger.debug({ userId, messageId, missingField }, 'Creating prompt for missing field request');

    const systemPrompt = new SystemMessage(
      systemPromptText.replace('{missingField}', missingField),
    );

    const response = await getTextLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'askUserInfo');

    const replies: Replies = [{ reply_type: 'text', reply_text: response.text }];
    logger.debug(
      { userId, messageId, replyLength: response.text.length },
      'Successfully generated ask user info reply',
    );
    return {
      ...state,
      assistantReply: replies,
      pending: PendingType.ASK_USER_INFO,
    };
  } catch (err: unknown) {
    throw new InternalServerError('Failed to generate ask user info response', {
      cause: err,
    });
  }
}
