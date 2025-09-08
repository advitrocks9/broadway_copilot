import { z } from 'zod';
import { Gender, AgeGroup, PendingType } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Infers and optionally persists the user's gender from recent conversation.
 */
const logger = getLogger('node:infer_profile');

const LLMOutputSchema = z.object({
  inferred_gender: z.enum(Gender).describe("The user's inferred gender, which must be one of the values from the Gender enum."),
  inferred_age_group: z.enum(AgeGroup).describe("The user's inferred age group, which must be one of the values from the AgeGroup enum."),
});

export async function inferProfileNode(state: any) {
  const systemPrompt = await loadPrompt('infer_profile.txt');
  
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const partialPrompt = await promptTemplate.partial({});

  const formattedPrompt = await partialPrompt.invoke({ history: state.conversationHistoryTextOnly || [] });

  const llm = getTextLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  const user = await prisma.user.update({
    where: { id: state.user.id },
    data: { inferredGender: response.inferred_gender, inferredAgeGroup: response.inferred_age_group }
  });

  logger.debug({ userId: state.user.id, gender: response.inferred_gender, ageGroup: response.inferred_age_group }, 'Profile inferred');
  return { ...state, user, pending: PendingType.NONE };
}
