import { z } from 'zod';

import { getNanoLLM } from '../../services/openaiService';
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
  intent: z.enum(['general', 'occasion', 'vacation', 'pairing', 'vibe_check', 'color_analysis', 'suggest']),
  missingProfileField: z.enum(['gender','age_group']).nullable(),
});


export async function routeIntent(state: any): Promise<any> {

  const buttonPayload = state.input.buttonPayload;

  if (buttonPayload) {
    logger.debug({ input: state.input, intent: buttonPayload }, 'RouteIntent: skip LLM due to button payload');
    return { intent: buttonPayload, missingProfileField: null };
  }

  if (numImagesInMessage(state.conversationHistory) > 0) {
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

  let history = state.conversationHistoryLight

  const formattedPrompt = await promptTemplate.invoke({ history });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  logger.info(response, 'RouteIntent: output');

  return response;
}
