import { z } from 'zod';

import prisma from '../../db/client';
import { RunInput } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';

/**
 * Infers and optionally persists the user's gender from recent conversation.
 */
const logger = getLogger('node:infer_profile');

interface GenderJson {
  inferred_gender: 'male' | 'female' | null;
  confirmed: boolean;
}

interface InferProfileState {
  input: RunInput;
  messages?: unknown[];
}

interface InferProfileResult {
  input?: RunInput;
}

export async function inferProfileNode(state: InferProfileState): Promise<InferProfileResult>{
  const { input } = state;
  if (input.gender === 'male' || input.gender === 'female') {
    return { input };
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  const existingGender: 'male' | 'female' | null = (user?.confirmedGender as any) ?? (user?.inferredGender as any) ?? null;
  if (existingGender) {
    return { input: { ...input, gender: existingGender } };
  }

  const prompt = await loadPrompt('infer_profile.txt');
  const content: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: prompt },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    { role: 'user', content: input.text || '' },
  ];

  const Schema = z.object({
    inferred_gender: z.union([z.literal('male'), z.literal('female')]).nullable(),
    confirmed: z.boolean()
  });

  logger.info({ userText: input.text || '' }, 'InferProfile: input');
  logger.debug({ content }, 'InferProfile: model input');

  let response: GenderJson;
  try {
    response = await getNanoLLM().withStructuredOutput(Schema as any).invoke(content as any) as GenderJson;
  } catch (err: any) {
    logger.error({ message: err?.message }, 'InferProfile: error');
    return { input };
  }
  logger.info(response, 'InferProfile: output');

  const inferred = response.inferred_gender;
  if (!inferred) {
    return { input };
  }

  if (response.confirmed) {
    await prisma.user.update({
      where: { id: input.userId },
      data: { confirmedGender: inferred, inferredGender: null }
    });
  } else {
    await prisma.user.update({
      where: { id: input.userId },
      data: { inferredGender: inferred }
    });
  }

  return { input: { ...input, gender: inferred } };
}

