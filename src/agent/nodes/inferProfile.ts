import { z } from 'zod';
import { Gender, AgeGroup, PendingType } from '@prisma/client';

import prisma from '../../db/client';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Infers and optionally persists the user's gender from recent conversation.
 */
const logger = getLogger('node:infer_profile');

const LLMOutputSchema = z.object({
  inferred_gender: z.enum(Gender),
  confirmed: z.boolean(),
  inferred_age_group: z.enum(AgeGroup),
});

export async function inferProfileNode(state: any): Promise<void>{
  const systemPrompt = await loadPrompt('infer_profile.txt');
  
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  const partialPrompt = await promptTemplate.partial({});

  const formattedPrompt = await partialPrompt.invoke({ history: state.conversationHistory || [] });

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(LLMOutputSchema as any)
    .invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

  const user = await prisma.user.update({
    where: { id: state.user.id },
    data: { inferredGender: response.inferred_gender, inferredAgeGroup: response.inferred_age_group }
  });

  state.user = user;
  state.pending = PendingType.NONE;
  logger.info(response, 'InferProfile: output');
  return;
}

