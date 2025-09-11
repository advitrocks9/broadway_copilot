import { z } from 'zod';

import { invokeAgent, invokeTextLLMWithJsonOutput } from '../../lib/llm';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';
import { searchWardrobe, fetchColorAnalysis } from '../tools';
import { Replies } from '../state';
import { GraphState } from '../state';
/**
 * Structured output schema for final styling suggestion from LLM.
 * Defines the format for the generated fashion recommendation response.
 */
const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The main outfit suggestion.'),
  message2_text: z
    .string()
    .nullable()
    .describe(
      'An optional, short follow-up message to ask a question or suggest the next step.',
    ),
});

/**
 * Handles styling requests by coordinating wardrobe search and color analysis tools.
 * Uses LLM with tool calling to generate personalized fashion suggestions based on
 * user intent (occasion, vacation, pairing, suggest) and available wardrobe data.
 *
 * @param state - Agent graph state containing user data, styling intent, and conversation history
 * @returns Updated state with assistant reply containing styling suggestions
 */
export async function handleStylingNode(state: GraphState): Promise<GraphState> {
  const { user, stylingIntent, conversationHistoryTextOnly } = state;
  const userId = user.id;
  const lastMessage = conversationHistoryTextOnly.at(-1);

  if (!stylingIntent) {
    throw createError.internalServerError('handleStylingNode called without a styling intent.');
  }

  try {
    if (lastMessage?.additional_kwargs?.buttonPayload) {
    const defaultPromptText = await loadPrompt('handle_styling_no_input.txt', { injectPersona: true });
    const defaultPrompt = defaultPromptText.replace('{INTENT}', stylingIntent);
    const response = await invokeTextLLMWithJsonOutput(defaultPrompt, LLMOutputSchema);
    const reply_text = response.message1_text as string;
    logger.debug({ userId, reply_text }, 'Returning with default LLM reply');
    const replies: Replies = [{ reply_type: 'text', reply_text }];
    return { ...state, assistantReply: replies };
    }

    const tools = [
      searchWardrobe(userId),
      fetchColorAnalysis(userId),
    ];

    const systemPrompt = await loadPrompt(`handle_${stylingIntent}.txt`, { injectPersona: true });

    const finalResponse = await invokeAgent(
      tools,
      systemPrompt,
      conversationHistoryTextOnly,
      LLMOutputSchema,
    );

    const replies: Replies = [{ reply_type: 'text', reply_text: finalResponse.message1_text }];
    if (finalResponse.message2_text) {
      replies.push({ reply_type: 'text', reply_text: finalResponse.message2_text });
    }

    logger.debug({ userId, replies }, 'Returning styling response');
    return { ...state, assistantReply: replies };
  } catch (err: any) {
    logger.error({ userId, err: err.message, stack: err.stack }, 'Error handling styling intent');
    const replies: Replies = [{ reply_type: 'text', reply_text: "I'm having trouble with that request. Let's try something else." }];
    return { ...state, assistantReply: replies };
  }
}

