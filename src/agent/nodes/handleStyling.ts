import { z } from 'zod';

import { invokeAgent, invokeTextLLMWithJsonOutput } from '../../lib/llm';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { searchWardrobe, fetchColorAnalysis } from '../tools';
import { Replies } from '../state';

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
export async function handleStylingNode(state: any) {
  const userId = state.user?.id;
  const { stylingIntent, conversationHistoryTextOnly } = state;
  const lastMessage = conversationHistoryTextOnly?.at(-1);

  try {
    if (lastMessage?.additional_kwargs?.buttonPayload) {
      return handleDefaultStyling(state, stylingIntent);
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

/**
 * Handles default styling response when input is from button payload only.
 * Generates a basic suggestion without additional tools.
 *
 * @param state - Current agent state
 * @param stylingIntent - The specific styling intent
 * @returns Updated state with default reply
 */
async function handleDefaultStyling(state: any, stylingIntent: string) {
  const userId = state.user?.id;
  const defaultPromptText = await loadPrompt('handle_styling_no_input.txt', { injectPersona: true });
  const defaultPrompt = defaultPromptText.replace('{INTENT}', stylingIntent);
  const response = await invokeTextLLMWithJsonOutput(defaultPrompt, LLMOutputSchema);
  const reply_text = response.message1_text as string;
  logger.debug({ userId, reply_text }, 'Returning with default LLM reply');
  const replies: Replies = [{ reply_type: 'text', reply_text }];
  return { ...state, assistantReply: replies };
}

