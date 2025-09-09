// import { z } from 'zod';

// import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
// import { AgeGroup, Gender, MemoryCategory, MessageRole } from '@prisma/client';

// import { prisma } from '../lib/prisma';
// import { redis } from '../lib/redis';
// import { createError } from '../utils/errors';
// import { loadPrompt } from '../utils/prompts';
// import { logger }  from '../utils/logger';

// import { getTextLLM } from '../lib/llm';

// const MEMORY_ZSET_KEY = 'ltm:schedule';

// export async function scheduleMemoryExtractionForUser(userId: string, delayMs: number = 5 * 60 * 1000): Promise<void> {
//   if (!userId) {
//     throw createError.badRequest('User ID is required');
//   }

//   try {
//     const runAt = Date.now() + delayMs;
//     await redis.zAdd(MEMORY_ZSET_KEY, { score: runAt, value: userId });
//     logger.debug({ userId, runAt }, 'Scheduled memory extraction');
//   } catch (err: any) {
//     logger.error({ userId, err: err?.message }, 'Failed to schedule memory extraction');
//     throw createError.internalServerError('Failed to schedule memory extraction');
//   }
// }

// async function processDueMemoryJobs(maxBatch: number = 50): Promise<void> {
//   const now = Date.now();
//   const dueUserIds = await redis.zRangeByScore(MEMORY_ZSET_KEY, 0, now, { LIMIT: { offset: 0, count: maxBatch } });
//   if (dueUserIds.length === 0) return;

//   logger.info({ count: dueUserIds.length }, `Processing ${dueUserIds.length} due memory jobs`);
//   for (const userId of dueUserIds) {
//     const lockKey = `ltm:lock:${userId}`;
//     const gotLock = await redis.set(lockKey, String(Date.now()), { NX: true, PX: 60_000 });
//     if (!gotLock) {
//       logger.debug({ userId }, 'Could not acquire lock for memory job, skipping');
//       continue;
//     }
//     try {
//       await redis.zRem(MEMORY_ZSET_KEY, userId);
//       await extractAndUpsertMemories(userId);
//     } catch (err: any) {
//       logger.error({ userId, err: err?.message, stack: err.stack }, 'Failed processing memory job');
//       // Don't re-throw here as this is a background job
//     } finally {
//       try {
//         await redis.del(lockKey);
//       } catch (lockErr: any) {
//         logger.error({ userId, lockErr: lockErr?.message }, 'Failed to release memory job lock');
//       }
//     }
//   }
// }

// export function launchMemoryWorker(pollIntervalMs: number = 10_000): NodeJS.Timeout {
//   logger.info({ pollIntervalMs }, 'Launching memory worker');
//   return setInterval(async () => {
//     try {
//       await processDueMemoryJobs();
//     } catch (err: any) {
//       logger.error({ err: err?.message }, 'Memory worker iteration failed');
//     }
//   }, pollIntervalMs);
// }

// const MemoryItemSchema = z.object({
//   category: z.enum(MemoryCategory),
//   key: z.string().min(1),
//   value: z.string().min(1),
//   confidence: z.number().min(0).max(1).optional(),
// });

// const ExtractionSchema = z.object({
//   memories: z.array(MemoryItemSchema).default([]),
//   inferredGender: z.enum(Gender).nullable().optional(),
//   inferredAgeGroup: z.enum(AgeGroup).nullable().optional(),
// });

// async function extractAndUpsertMemories(userId: string): Promise<void> {
//   const messages = await prisma.message.findMany({
//     where: { userId, memoriesProcessed: false },
//     orderBy: { createdAt: 'asc' },
//     select: { id: true, role: true, content: true, createdAt: true },
//   });

//   if (messages.length === 0) {
//     logger.debug({ userId }, 'No unprocessed messages for memory extraction');
//     return;
//   }
//   logger.info({ userId, count: messages.length }, `Extracting memories from ${messages.length} messages`);

//   const history: BaseMessage[] = messages.map((m: any) => {
//     if (m.role === MessageRole.USER) {
//       return new HumanMessage({ content: m.content as any, additional_kwargs: { createdAt: m.createdAt, messageId: m.id } });
//     }
//     return new AIMessage({ content: m.content as any, additional_kwargs: { createdAt: m.createdAt, messageId: m.id } });
//   });

//   const llm = getTextLLM();
//   const systemPrompt = await loadPrompt('memory_extraction.txt');

//   const inputMessages = [
//     { role: 'system', content: systemPrompt },
//     ...history.map((m) => ({ role: m instanceof HumanMessage ? 'user' : 'assistant', content: m.content as any })),
//     { role: 'user', content: 'Extract memories now. Respond with JSON only.' },
//   ];

//   let extracted: z.infer<typeof ExtractionSchema> | null = null;
//   try {
//     const resp = await llm.invoke(inputMessages as any);
//     const raw = typeof resp?.content === 'string' ? resp.content : Array.isArray(resp?.content) ? (resp.content[0] as any)?.text ?? '' : '';
//     const jsonStart = raw.indexOf('{');
//     const jsonEnd = raw.lastIndexOf('}');
//     const jsonStr = jsonStart >= 0 && jsonEnd >= 0 ? raw.slice(jsonStart, jsonEnd + 1) : raw;
//     const parsed = JSON.parse(jsonStr);
//     extracted = ExtractionSchema.parse(parsed);
//     logger.debug({ userId, extracted }, 'Successfully extracted memories from LLM response');
//   } catch (err: any) {
//     logger.error({ userId, err: err?.message, stack: err.stack }, 'LLM extraction failed or invalid JSON');
//     extracted = { memories: [], inferredGender: null, inferredAgeGroup: null };
//   }

//   const sourceMessageIds = messages.map((m: any) => m.id);

//   if (extracted.memories.length > 0) {
//     const existing = await prisma.memory.findMany({ where: { userId } });
//     const existingMap = new Map<string, { id: string; value: string; sourceMessageIds: string[] }>();
//     for (const m of existing) {
//       existingMap.set(`${m.category}:${m.key}`.toLowerCase(), { id: m.id, value: m.value, sourceMessageIds: m.sourceMessageIds });
//     }
//     logger.debug({ userId, count: existing.length }, `Found ${existing.length} existing memories`);

//     let createdCount = 0;
//     let updatedCount = 0;
//     let noChangeCount = 0;

//     for (const item of extracted.memories) {
//       const keyId = `${item.category}:${item.key}`.toLowerCase();
//       const current = existingMap.get(keyId);
//       if (current) {
//         if (current.value.trim().toLowerCase() !== item.value.trim().toLowerCase()) {
//           updatedCount++;
//           await prisma.memory.update({
//             where: { id: current.id },
//             data: {
//               value: item.value,
//               confidence: item.confidence ?? null,
//               sourceMessageIds: Array.from(new Set([...(current.sourceMessageIds || []), ...sourceMessageIds])),
//             },
//           });
//         } else {
//           const mergedSources = Array.from(new Set([...(current.sourceMessageIds || []), ...sourceMessageIds]));
//           if (mergedSources.length !== (current.sourceMessageIds || []).length) {
//             updatedCount++;
//             await prisma.memory.update({ where: { id: current.id }, data: { sourceMessageIds: mergedSources } });
//           } else {
//             noChangeCount++;
//           }
//         }
//       } else {
//         createdCount++;
//         await prisma.memory.create({
//           data: {
//             userId,
//             category: item.category,
//             key: item.key,
//             value: item.value,
//             confidence: item.confidence ?? null,
//             sourceMessageIds,
//           },
//         });
//       }
//     }
//     logger.info(
//       { userId, created: createdCount, updated: updatedCount, noChange: noChangeCount },
//       'Memory upsert finished'
//     );
//   }

//   const updates: any = {};
//   if (extracted.inferredGender) updates.inferredGender = extracted.inferredGender;
//   if (extracted.inferredAgeGroup) updates.inferredAgeGroup = extracted.inferredAgeGroup;
//   if (Object.keys(updates).length > 0) {
//     try {
//       await prisma.user.update({ where: { id: userId }, data: updates });
//       logger.info({ userId, updates }, 'Updated inferred user profile');
//     } catch (err: any) {
//       logger.warn({ userId, err: err?.message, stack: err.stack }, 'Failed to update inferred profile fields');
//     }
//   }

//   await prisma.message.updateMany({ where: { id: { in: sourceMessageIds } }, data: { memoriesProcessed: true } });
//   logger.info({ userId, processedCount: sourceMessageIds.length, memoryCount: extracted.memories.length }, 'Memory extraction complete');
// }