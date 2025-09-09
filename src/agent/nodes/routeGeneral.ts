import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { getTextLLM } from '../../lib/llm';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';

import { GeneralIntent } from '../state';

const GREETING_REGEX = /\b(hi|hello|hey|heya|yo|sup)\b/i;
const MENU_REGEX = /\b(help|menu|options?|what can you do\??)\b/i;

const LLMOutputSchema = z.object({
  generalIntent: z
    .enum(['greeting', 'menu', 'chat'])
    .describe("The user's specific intent, used to route to the correct general handler."),
});

type LLMOutput = z.infer<typeof LLMOutputSchema>;

/**
 * Routes general messages (greeting/menu/chat) via regex shortcuts, else LLM.
 */
export async function routeGeneralNode(state: any) {
  const userId = state.user?.id;
  const messageId = state.input?.MessageSid;
  const lastMessage = state.conversationHistoryTextOnly.at(-1)?.content ?? '';

  logger.info({ userId, messageId, lastMessage }, 'Routing general intent');

  try {
    // Regex routing for common cases
    if (GREETING_REGEX.test(lastMessage)) {
      logger.debug({ userId }, 'General intent routed to "greeting" by regex');
      return { generalIntent: 'greeting' as GeneralIntent };
    }
    if (MENU_REGEX.test(lastMessage)) {
      logger.debug({ userId }, 'General intent routed to "menu" by regex');
      return { generalIntent: 'menu' as GeneralIntent };
    }

    // LLM routing for other cases
    const systemPrompt = await loadPrompt('route_general.txt');

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('history'),
    ]);

    const formattedPrompt = await promptTemplate.invoke({
      history: state.conversationHistoryTextOnly,
    });

    const llm = getTextLLM();
    const response = (await llm
      .withStructuredOutput(LLMOutputSchema)
      .invoke(formattedPrompt.toChatMessages())) as LLMOutput;

    logger.info(
      { userId, generalIntent: response.generalIntent },
      'General intent routed using LLM'
    );

    return response;
  } catch (err: any) {
    logger.error({ userId, messageId, err: err.message, stack: err.stack }, 'Error routing general intent');
    if (err.statusCode) {
      throw err;
    }
    return { generalIntent: 'chat' as GeneralIntent };
  }
}
