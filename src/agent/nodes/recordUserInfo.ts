import { z } from 'zod';

import { Gender, AgeGroup, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { loadPrompt } from '../../utils/prompts';
import { GraphState } from '../state';

/**
 * Structured output schema for confirming user profile fields.
 */
const LLMOutputSchema = z.object({
  confirmed_gender: z.enum(Gender).describe("The user's inferred gender, which must be one of the values from the Gender enum."),
  confirmed_age_group: z.enum(AgeGroup).describe("The user's inferred age group, which must be one of the values from the AgeGroup enum."),
});

/**
 * Extracts and persists confirmed user profile fields inferred from recent conversation.
 * Resets pending state to NONE when complete.
 */
export async function recordUserInfoNode(state: GraphState): Promise<GraphState> {

  const systemPromptText = await loadPrompt('record_user_info.txt');
  const systemPrompt = new SystemMessage(systemPromptText);

  const response = await getTextLLM().withStructuredOutput(LLMOutputSchema).run(
    systemPrompt,
    state.conversationHistoryTextOnly,
  );

  const user = await prisma.user.update({
    where: { id: state.user.id },
    data: { confirmedGender: response.confirmed_gender, confirmedAgeGroup: response.confirmed_age_group }
  });

  return { ...state, user, pending: PendingType.NONE };
}
