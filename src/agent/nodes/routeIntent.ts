import { z } from 'zod';

import { PendingType } from '@prisma/client';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { numImagesInMessage } from '../../utils/context';
import { InternalServerError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState, IntentLabel } from '../state';

/**
 * Schema for LLM output defining the routing decision.
 * Determines the primary intent and any missing profile requirements.
 */
const LLMOutputSchema = z.object({
  intent: z
    .enum(['general', 'vibe_check', 'color_analysis', 'styling'])
    .describe(
      "The primary intent of the user's message, used to route to the appropriate handler.",
    ),
  missingProfileField: z
    .enum(['gender', 'age_group'])
    .nullable()
    .describe(
      "The profile field that is missing and required to fulfill the user's intent. Null if no field is missing.",
    ),
});

/**
 * Routes the user's message to the appropriate handler based on intent analysis.
 * Uses a hierarchical routing strategy: button payloads → pending intents → LLM analysis.
 *
 * @param state - The current state of the agent graph containing user data and conversation history
 * @returns The determined intent and any new missing profile field that needs to be collected
 */
export async function routeIntent(state: GraphState): Promise<GraphState> {
  const { user, input, conversationHistoryWithImages, pending } = state;
  const userId = user.id;
  const buttonPayload = input.ButtonPayload;

  // Priority 1: Handle explicit button payload routing
  if (buttonPayload) {
    const stylingRelated: string[] = ['styling', 'occasion', 'vacation', 'pairing'];
    const otherValid: string[] = ['general', 'vibe_check', 'color_analysis', 'suggest'];

    let intent: IntentLabel = 'general';
    if (stylingRelated.includes(buttonPayload)) {
      intent = 'styling';
    } else if (otherValid.includes(buttonPayload)) {
      intent = buttonPayload as IntentLabel;
    }

    logger.debug(
      { userId, routedIntent: intent, buttonPayload },
      'Routed intent from button payload',
    );
    return { ...state, intent, missingProfileField: null };
  }

  // Priority 2: Handle pending image-based intents
  const imageCount = numImagesInMessage(conversationHistoryWithImages);
  if (imageCount > 0) {
    if (pending === PendingType.VIBE_CHECK_IMAGE) {
      logger.debug({ userId }, 'Routing to vibe_check due to pending intent and image presence');
      return { ...state, intent: 'vibe_check', missingProfileField: null };
    } else if (pending === PendingType.COLOR_ANALYSIS_IMAGE) {
      logger.debug(
        { userId },
        'Routing to color_analysis due to pending intent and image presence',
      );
      return { ...state, intent: 'color_analysis', missingProfileField: null };
    }
  }

  // Calculate cooldown periods for premium services (30-minute cooldown)
  const now = Date.now();
  const lastVibeCheckAt = user.lastVibeCheckAt?.getTime() ?? null;
  const vibeMinutesAgo = lastVibeCheckAt ? Math.floor((now - lastVibeCheckAt) / (1000 * 60)) : -1;
  const canDoVibeCheck = vibeMinutesAgo === -1 || vibeMinutesAgo >= 30;

  const lastColorAnalysisAt = user.lastColorAnalysisAt?.getTime() ?? null;
  const colorMinutesAgo = lastColorAnalysisAt
    ? Math.floor((now - lastColorAnalysisAt) / (1000 * 60))
    : -1;
  const canDoColorAnalysis = colorMinutesAgo === -1 || colorMinutesAgo >= 30;

  // Priority 3: Use LLM for intelligent intent classification
  try {
    const systemPromptText = await loadPrompt('routing/route_intent.txt');
    const formattedSystemPrompt = systemPromptText
      .replace('{can_do_vibe_check}', canDoVibeCheck.toString())
      .replace('{can_do_color_analysis}', canDoColorAnalysis.toString());

    const systemPrompt = new SystemMessage(formattedSystemPrompt);

    const response = await getTextLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'routeIntent');

    let { intent, missingProfileField } = response;

    if (missingProfileField) {
      if (missingProfileField === 'gender' && (user.inferredGender || user.confirmedGender)) {
        missingProfileField = null;
      } else if (
        missingProfileField === 'age_group' &&
        (user.inferredAgeGroup || user.confirmedAgeGroup)
      ) {
        missingProfileField = null;
      }
    }

    logger.debug({ userId, intent, missingProfileField }, 'Intent routed via LLM');

    return { ...state, intent, missingProfileField };
  } catch (err: unknown) {
    throw new InternalServerError('Failed to route intent', { cause: err });
  }
}
