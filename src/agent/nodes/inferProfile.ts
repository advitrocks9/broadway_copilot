import { getNanoLLM } from '../../utils/llm';
import prisma from '../../db/client';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { fetchLatestConversationMessages } from '../tools';

type GenderJson = { inferred_gender: 'male' | 'female' | null; confirmed: boolean };

/**
 * Infers and optionally persists the user's gender from recent conversation.
 */
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

  const prompt = loadPrompt('infer_profile.txt');
  const llm = getNanoLLM();
  const existingMessages = (state.messages as unknown[]) || [];
  const messages = existingMessages.length > 0
    ? existingMessages
    : (await fetchLatestConversationMessages(input.userId)).messages;
  const content: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `Transcript: ${JSON.stringify(messages)}` },
  ];

  const Schema = z.object({ inferred_gender: z.union([z.literal('male'), z.literal('female')]).nullable(), confirmed: z.boolean() });
  console.log('🧠 [INFER_PROFILE:INPUT]', { lastTurns: messages.slice(-6) });
  let result: GenderJson;
  try {
    result = await llm.withStructuredOutput(Schema).invoke(content) as GenderJson;
  } catch (err: any) {
    console.error('🧠 [INFER_PROFILE:ERROR]', err?.message);
    return { input };
  }
  console.log('🧠 [INFER_PROFILE:OUTPUT]', result);

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

