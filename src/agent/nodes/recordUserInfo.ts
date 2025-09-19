import { z } from 'zod';

import { AgeGroup, Gender, PendingType } from '@prisma/client';

import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { prisma } from '../../lib/prisma';
import { InternalServerError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState } from '../state';

/**
 * Structured output schema for confirming user profile fields.
 */
const LLMOutputSchema = z.object({
  confirmed_gender: z
    .enum(Gender)
    .describe("The user's inferred gender, which must be one of the values from the Gender enum."),
  confirmed_age_group: z
    .enum(AgeGroup)
    .describe(
      "The user's inferred age group, which must be one of the values from the AgeGroup enum.",
    ),
});

/**
 * Extracts and persists confirmed user profile fields inferred from recent conversation.
 * Resets pending state to NONE when complete.
 */
export async function recordUserInfo(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  try {
    const systemPromptText = await loadPrompt('data/record_user_info.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const response = await getTextLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'recordUserInfo');

    const user = await prisma.user.update({
      where: { id: state.user.id },
      data: {
        confirmedGender: response.confirmed_gender,
        confirmedAgeGroup: response.confirmed_age_group,
      },
    });
    logger.debug({ userId }, 'User info recorded successfully');
    return { ...state, user, pending: PendingType.NONE };
  } catch (err: unknown) {
    throw new InternalServerError('Failed to record user info', { cause: err });
  }
}
