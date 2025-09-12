import { z } from 'zod';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';

import { StylingIntent, Replies } from '../state';
import { GraphState } from '../state';
/**
 * Routes the input to the appropriate styling handler based on the sub-router prompt.
 */
const LLMOutputSchema = z.object({
  stylingIntent: z.enum(['occasion', 'vacation', 'pairing', 'suggest']).describe("The specific styling intent of the user's message, used to route to the appropriate styling handler."),
});

/**
 * Routes styling flows from button payload or LLM classification.
 */
export async function routeStyling(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  const messageId = state.input.MessageSid;
  const buttonPayload = state.input.ButtonPayload;

  logger.info({ userId, messageId, buttonPayload }, 'Routing styling intent');

  try {
    if (buttonPayload === 'styling') {
      const stylingButtons = [
        { text: 'Occasion', id: 'occasion' },
        { text: 'Pairing', id: 'pairing' },
        { text: 'Vacation', id: 'vacation' },
      ];

      const replies: Replies = [{
        reply_type: 'quick_reply',
        reply_text: 'Please select which styling service you need',
        buttons: stylingButtons
      }];
      logger.debug({ userId }, 'Returning styling menu for flow continuation');
      return { ...state, assistantReply: replies };
    }

    if (buttonPayload && ['occasion', 'vacation', 'pairing', 'suggest'].includes(buttonPayload)) {
      logger.debug({ userId }, 'Styling intent routed using button payload');
      return { ...state, stylingIntent: buttonPayload as StylingIntent };
    }

    const systemPromptText = await loadPrompt('route_styling.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const response = await getTextLLM().withStructuredOutput(LLMOutputSchema).run(
      systemPrompt,
      state.conversationHistoryTextOnly,
    );

    logger.info({ userId, stylingIntent: response.stylingIntent }, 'Styling intent routed using LLM');

    return { ...state, ...response };
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    logger.warn({ userId, err: err.message }, 'Failed to route styling intent, falling back to general');
    return { ...state, stylingIntent: null };
  }
}
