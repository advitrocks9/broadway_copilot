import { getNanoLLM } from '../../services/openaiService';
import prisma from '../../db/client';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getLogger } from '../../utils/logger';

type GenderJson = { inferred_gender: 'male' | 'female' | null; confirmed: boolean };

/**
 * Infers and optionally persists the user's gender from recent conversation.
 */
const logger = getLogger('node:infer_profile');
export async function inferProfileNode(state: { input: RunInput; messages?: unknown[] }): Promise<{ input?: RunInput }>{
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

  const Schema = z.object({ inferred_gender: z.union([z.literal('male'), z.literal('female')]).nullable(), confirmed: z.boolean() });
  logger.info({ userText: input.text || '' }, 'InferProfile: input');
  console.log('🤖 InferProfile Model Input:', JSON.stringify(content, null, 2));
  let result: GenderJson;
  try {
    result = await getNanoLLM().withStructuredOutput(Schema as any).invoke(content as any) as GenderJson;
  } catch (err: any) {
    logger.error({ message: err?.message }, 'InferProfile: error');
    return { input };
  }
  logger.info(result, 'InferProfile: output');

  const inferred = result.inferred_gender;
  if (!inferred) {
    return { input };
  }

  if (result.confirmed) {
    await prisma.user.update({ where: { id: input.userId }, data: { confirmedGender: inferred, inferredGender: null } });
  } else {
    await prisma.user.update({ where: { id: input.userId }, data: { inferredGender: inferred } });
  }

  return { input: { ...input, gender: inferred } };
}

