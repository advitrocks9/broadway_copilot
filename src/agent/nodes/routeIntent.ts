import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { PendingType } from '@prisma/client';

import { getTextLLM } from '../../lib/llm';
import { numImagesInMessage } from '../../utils/conversation';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { GraphAnnotation } from '../graph';

/**
 * Schema for LLM output defining the routing decision.
 * Determines the primary intent and any missing profile requirements.
 */
const LLMOutputSchema = z.object({
  intent: z.enum(['general', 'vibe_check', 'color_analysis', 'styling']).describe("The primary intent of the user's message, used to route to the appropriate handler."),
  missingProfileField: z.enum(['gender', 'age_group']).nullable().describe("The profile field that is missing and required to fulfill the user's intent. Null if no field is missing."),
});

type RouteIntentOutput = z.infer<typeof LLMOutputSchema>;

/**
 * Routes the user's message to the appropriate handler based on intent analysis.
 * Uses a hierarchical routing strategy: button payloads → pending intents → LLM analysis.
 *
 * @param state - The current state of the agent graph containing user data and conversation history
 * @returns The determined intent and any missing profile field that needs to be collected
 */
export async function routeIntent(state: typeof GraphAnnotation.State): Promise<RouteIntentOutput> {
  const { user, input, conversationHistoryWithImages, pending, conversationHistoryTextOnly } = state;
  const userId = user?.id;
  const buttonPayload = input?.ButtonPayload as string | undefined;

  // Priority 1: Handle explicit button payload routing
  if (buttonPayload) {
    const stylingRelated = ['styling', 'occasion', 'vacation', 'pairing', 'suggest'] as const;
    const otherValid = ['general', 'vibe_check', 'color_analysis'] as const;

    if (stylingRelated.includes(buttonPayload as any)) {
      logger.debug({ userId, routedIntent: 'styling' }, 'Routed to styling intent from button payload');
      return { intent: 'styling', missingProfileField: null };
    } else if (otherValid.includes(buttonPayload as any)) {
      logger.debug({ userId, routedIntent: buttonPayload }, 'Routed to specific intent from button payload');
      return { intent: buttonPayload as typeof otherValid[number], missingProfileField: null };
    } else {
      logger.debug({ userId, routedIntent: 'general' }, 'Routing unknown button payload to general intent');
      return { intent: 'general', missingProfileField: null };
    }
  }

  // Priority 2: Handle pending image-based intents
  const imageCount = numImagesInMessage(conversationHistoryWithImages ?? []);
  if (imageCount > 0) {
    if (pending === PendingType.VIBE_CHECK_IMAGE) {
      logger.debug({ userId }, 'Routing to vibe_check due to pending intent and image presence');
      return { intent: 'vibe_check', missingProfileField: null };
    } else if (pending === PendingType.COLOR_ANALYSIS_IMAGE) {
      logger.debug({ userId }, 'Routing to color_analysis due to pending intent and image presence');
      return { intent: 'color_analysis', missingProfileField: null };
    }
  }

  // Calculate cooldown periods for premium services (30-minute cooldown)
  const now = Date.now();
  const lastVibeCheckAt = user?.lastVibeCheckAt?.getTime() ?? null;
  const vibeMinutesAgo = lastVibeCheckAt ? Math.floor((now - lastVibeCheckAt) / (1000 * 60)) : -1;
  const canDoVibeCheck = vibeMinutesAgo === -1 || vibeMinutesAgo >= 30;

  const lastColorAnalysisAt = user?.lastColorAnalysisAt?.getTime() ?? null;
  const colorMinutesAgo = lastColorAnalysisAt ? Math.floor((now - lastColorAnalysisAt) / (1000 * 60)) : -1;
  const canDoColorAnalysis = colorMinutesAgo === -1 || colorMinutesAgo >= 30;

  // Priority 3: Use LLM for intelligent intent classification
  try {
    const systemPrompt = await loadPrompt('route_intent.txt');
    const formattedSystemPrompt = systemPrompt
      .replace('{can_do_vibe_check}', canDoVibeCheck.toString())
      .replace('{can_do_color_analysis}', canDoColorAnalysis.toString());

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', formattedSystemPrompt],
      new MessagesPlaceholder('history'),
    ]);

    const history = conversationHistoryTextOnly;
    const formattedPrompt = await promptTemplate.invoke({ history });

    const llm = getTextLLM();
    const response = (await (llm as any)
      .withStructuredOutput(LLMOutputSchema)
      .invoke(formattedPrompt.toChatMessages())) as RouteIntentOutput;

    logger.info({ userId, intent: response.intent, missingField: response.missingProfileField }, 'Intent routed via LLM analysis');

    return response;
  } catch (error) {
    logger.warn({ userId, error }, 'Failed to route intent via LLM, falling back to general intent');
    return { intent: 'general', missingProfileField: null };
  }
}
