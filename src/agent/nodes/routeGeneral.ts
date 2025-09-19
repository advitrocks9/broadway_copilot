import { z } from 'zod';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { extractTextContent } from '../../utils/text';

import { InternalServerError } from '../../utils/errors';
import { GeneralIntent, GraphState } from '../state';

const GREETING_REGEX = /\b(hi|hello|hey|heya|yo|sup)\b/i;
const MENU_REGEX = /\b(help|menu|options?|what can you do\??)\b/i;

const LLMOutputSchema = z.object({
  generalIntent: z
    .enum(['greeting', 'menu', 'chat'])
    .describe("The user's specific intent, used to route to the correct general handler."),
});

/**
 * Routes general messages (greeting/menu/chat) via regex shortcuts, else LLM.
 */
export async function routeGeneral(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  const messageId = state.input.MessageSid;
  const lastMessageContent = state.conversationHistoryTextOnly.at(-1)?.content;
  const lastMessage = lastMessageContent ? extractTextContent(lastMessageContent) : '';

  logger.debug({ userId, messageId, lastMessage }, 'Routing general intent');

  try {
    // Regex routing for common cases
    if (GREETING_REGEX.test(lastMessage)) {
      logger.debug({ userId }, 'General intent routed to "greeting" by regex');
      return { ...state, generalIntent: 'greeting' as GeneralIntent };
    }
    if (MENU_REGEX.test(lastMessage)) {
      logger.debug({ userId }, 'General intent routed to "menu" by regex');
      return { ...state, generalIntent: 'menu' as GeneralIntent };
    }

    // LLM routing for other cases
    const systemPromptText = await loadPrompt('routing/route_general.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const response = await getTextLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'routeGeneral');

    logger.debug(
      { userId, generalIntent: response.generalIntent },
      'General intent routed using LLM',
    );
    const { generalIntent } = response;
    return { ...state, generalIntent };
  } catch (err: unknown) {
    throw new InternalServerError('Failed to route general intent', {
      cause: err,
    });
  }
}
