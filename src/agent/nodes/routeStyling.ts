import { z } from 'zod';

import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { StylingIntent } from '../state';

const logger = getLogger('node:route_styling');

/**
 * Routes the input to the appropriate styling handler based on the sub-router prompt.
 */

const LLMOutputSchema = z.object({
  stylingIntent: z.enum(['occasion', 'vacation', 'pairing', 'suggest']).describe("The specific styling intent of the user's message, used to route to the appropriate styling handler."),
});

export async function routeStyling(state: any): Promise<{ stylingIntent: StylingIntent }> {
  const buttonPayload = state.input.buttonPayload;

  if (buttonPayload && ['occasion', 'vacation', 'pairing', 'suggest'].includes(buttonPayload)) {
    logger.debug({ buttonPayload }, 'RouteStyling: using button payload');
    return { stylingIntent: buttonPayload as StylingIntent };
  }

  const systemPrompt = await loadPrompt('route_styling.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistoryLight });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'RouteStyling: output');

  return response;
}
