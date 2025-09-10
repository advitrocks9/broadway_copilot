import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { Gender, AgeGroup, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { invokeTextLLMWithJsonOutput } from '../../lib/llm';
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

  const systemPrompt = await loadPrompt('record_user_info.txt');

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const formattedPrompt = await promptTemplate.invoke({ history: state.conversationHistoryTextOnly });

  const response = await invokeTextLLMWithJsonOutput(
    formattedPrompt.toChatMessages(),
    LLMOutputSchema,
  );

  const user = await prisma.user.update({
    where: { id: state.user.id },
    data: { confirmedGender: response.confirmed_gender, confirmedAgeGroup: response.confirmed_age_group }
  });

  return { ...state, user, pending: PendingType.NONE };
}
