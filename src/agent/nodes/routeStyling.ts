import { z } from 'zod';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';

import { InternalServerError } from '../../utils/errors';
import { GraphState, Replies, StylingIntent } from '../state';

const LLMOutputSchema = z.object({
  stylingIntent: z
    .enum(['occasion', 'vacation', 'pairing', 'suggest'])
    .describe("The specific styling intent of the user's message, used to route to the appropriate styling handler."),
});

export async function routeStyling(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  const buttonPayload = state.input.ButtonPayload;

  logger.debug({ userId, buttonPayload }, 'Entered routeStyling with button payload');

  try {
    if (buttonPayload === 'styling') {
      const stylingButtons = [
        { text: 'Occasion', id: 'occasion' },
        { text: 'Pairing', id: 'pairing' },
        { text: 'Vacation', id: 'vacation' },
      ];

      const replies: Replies = [
        {
          reply_type: 'quick_reply',
          reply_text: 'Please select which styling service you need',
          buttons: stylingButtons,
        },
      ];

      logger.debug({ userId }, 'Sending styling menu quick replies');
      return { ...state, assistantReply: replies };
    }

    if (buttonPayload && ['occasion', 'vacation', 'pairing', 'suggest'].includes(buttonPayload)) {
      logger.debug({ userId, buttonPayload }, 'Styling intent determined from button payload');
      return { ...state, stylingIntent: buttonPayload as StylingIntent };
    }

    // Fallback to LLM for routing if no button payload matches
    const systemPromptText = await loadPrompt('routing/route_styling.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const response = await getTextLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'routeStyling');

    logger.debug({ userId, stylingIntent: response.stylingIntent }, 'Styling intent determined from LLM');

    return { ...state, ...response };
  } catch (err: unknown) {
    logger.error({ userId, err }, 'Error in routeStyling');
    throw new InternalServerError('Failed to route styling intent', { cause: err });
  }
}
