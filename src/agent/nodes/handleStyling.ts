import { z } from 'zod';

import { agentExecutor } from '../../lib/ai/agents/executor';
import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { InternalServerError } from '../../utils/errors';
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
    throw new InternalServerError('handleStylingNode called without a styling intent.');
  }

  try {
    if (lastMessage?.meta?.buttonPayload) {
    const defaultPromptText = await loadPrompt('handlers/styling/handle_styling_no_input.txt');
    const systemPromptText = defaultPromptText.replace('{INTENT}', stylingIntent);
    const systemPrompt = new SystemMessage(systemPromptText);
    const response = await getTextLLM().withStructuredOutput(LLMOutputSchema).run(
      systemPrompt,
      state.conversationHistoryTextOnly,
    );
    const reply_text = response.message1_text as string;
    logger.debug({ userId, reply_text }, 'Returning with default LLM reply');
    const replies: Replies = [{ reply_type: 'text', reply_text }];
    return { ...state, assistantReply: replies };
    }

    const tools = [
      searchWardrobe(userId),
      fetchColorAnalysis(userId),
    ];

    const systemPromptText = await loadPrompt(`handlers/styling/handle_${stylingIntent}.txt`);
    const systemPrompt = new SystemMessage(systemPromptText);

    const finalResponse = await agentExecutor(
      getTextLLM(),
      systemPrompt,
      conversationHistoryTextOnly,
      { tools, outputSchema: LLMOutputSchema },
    );



    const replies: Replies = [{ reply_type: 'text', reply_text: finalResponse.message1_text }];
    if (finalResponse.message2_text) {
      replies.push({ reply_type: 'text', reply_text: finalResponse.message2_text });
    }

    logger.debug({ userId, replies }, 'Returning styling response');
    return { ...state, assistantReply: replies };
  } catch (err: unknown) {
    throw new InternalServerError('Failed to handle styling request', { cause: err });
  }
}

