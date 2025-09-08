import { z } from 'zod';

import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { PendingType } from '@prisma/client';
import { numImagesInMessage } from '../../utils/conversation';


/**
 * Routes the input to the appropriate handler node based on the router prompt.
 */
const logger = getLogger('node:route_intent');

/**
 * Schema for LLM output for route intent
 */
const LLMOutputSchema = z.object({
  intent: z.enum(['general', 'vibe_check', 'color_analysis', 'styling']).describe("The primary intent of the user's message, used to route to the appropriate handler."),
  missingProfileField: z.enum(['gender','age_group']).nullable().describe("The profile field that is missing and required to fulfill the user's intent. Null if no field is missing."),
});


export async function routeIntent(state: any): Promise<any> {

  const buttonPayload = state.input.ButtonPayload;

  if (buttonPayload) {
    logger.debug({ input: state.input, intent: buttonPayload }, 'RouteIntent: skip LLM due to button payload');
    if (['general', 'vibe_check', 'color_analysis', 'styling'].includes(buttonPayload)) {
      return { intent: buttonPayload, missingProfileField: null };
    } else {
      return { intent: 'styling', missingProfileField: null };
    }
  }

  if (numImagesInMessage(state.conversationHistoryWithImages) > 0) {
    if (state.pending === PendingType.VIBE_CHECK_IMAGE) {
      return { intent: 'vibe_check', missingProfileField: null };
    } else if (state.pending === PendingType.COLOR_ANALYSIS_IMAGE) {
      return { intent: 'color_analysis', missingProfileField: null };
    }
  }

  const systemPrompt = await loadPrompt('route_intent.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  let history = state.conversationHistoryTextOnly

  const formattedPrompt = await promptTemplate.invoke({ history });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.debug({ intent: response.intent, missingField: response.missingProfileField }, 'Intent routed');

  return response;
}
