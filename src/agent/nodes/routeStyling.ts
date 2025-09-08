import { z } from 'zod';

import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StylingIntent, Replies } from '../state';

const logger = getLogger('node:route_styling');

/**
 * Routes the input to the appropriate styling handler based on the sub-router prompt.
 */

const LLMOutputSchema = z.object({
  stylingIntent: z.enum(['occasion', 'vacation', 'pairing', 'suggest']).describe("The specific styling intent of the user's message, used to route to the appropriate styling handler."),
});

export async function routeStyling(state: any): Promise<{ stylingIntent?: StylingIntent; assistantReply?: Replies }> {
  const buttonPayload = state.input.ButtonPayload;

  if (buttonPayload == 'styling') {

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

    logger.debug({ buttonPayload }, 'RouteStyling: generated styling menu reply');
    return { assistantReply: replies };
  }

  if (buttonPayload && ['occasion', 'vacation', 'pairing', 'suggest'].includes(buttonPayload)) {
    logger.debug({ buttonPayload }, 'RouteStyling: using button payload');
    return { stylingIntent: buttonPayload as StylingIntent };
  }

  const systemPrompt = await loadPrompt('route_styling.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistoryTextOnly });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.debug({ stylingIntent: response.stylingIntent }, 'Styling intent routed');

  return response;
}
