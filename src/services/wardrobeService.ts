// import { z } from 'zod';

// import { HumanMessage } from '@langchain/core/messages';
// import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

// import { prisma } from '../lib/prisma';
// import { redis } from '../lib/redis';
// import { getVisionLLM } from '../lib/llm';
// import { createError } from '../utils/errors';
// import { loadPrompt } from '../utils/prompts';
// import { logger }  from '../utils/logger';
// import { toNameLower } from '../utils/text';

// const WARDROBE_ZSET_KEY = 'wardrobe:schedule';

// export async function scheduleWardrobeIndexForMessage(messageId: string, delayMs: number = 5 * 60 * 1000): Promise<void> {
//   if (!messageId) {
//     throw createError.badRequest('Message ID is required');
//   }

//   try {
//     const runAt = Date.now() + delayMs;
//     await redis.zAdd(WARDROBE_ZSET_KEY, { score: runAt, value: messageId });
//     logger.debug({ messageId, runAt }, 'Scheduled wardrobe indexing');
//   } catch (err: any) {
//     logger.error({ messageId, err: err?.message }, 'Failed to schedule wardrobe indexing');
//     throw createError.internalServerError('Failed to schedule wardrobe indexing');
//   }
// }

// async function processDueWardrobeJobs(maxBatch: number = 50): Promise<void> {
//   const now = Date.now();
//   const dueMessageIds = await redis.zRangeByScore(WARDROBE_ZSET_KEY, 0, now, { LIMIT: { offset: 0, count: maxBatch } });
//   if (dueMessageIds.length === 0) return;

//   logger.info({ count: dueMessageIds.length }, `Processing ${dueMessageIds.length} due wardrobe jobs`);
//   for (const messageId of dueMessageIds) {
//     const lockKey = `wardrobe:lock:${messageId}`;
//     const gotLock = await redis.set(lockKey, String(Date.now()), { NX: true, PX: 60_000 });
//     if (!gotLock) {
//       logger.debug({ messageId }, 'Could not acquire lock for wardrobe job, skipping');
//       continue;
//     }
//     try {
//       await redis.zRem(WARDROBE_ZSET_KEY, messageId);
//       await indexWardrobeFromMessage(messageId);
//     } catch (err: any) {
//       logger.error({ messageId, err: err?.message, stack: err.stack }, 'Failed processing wardrobe job');
//       // Don't re-throw here as this is a background job
//     } finally {
//       try {
//         await redis.del(lockKey);
//       } catch (lockErr: any) {
//         logger.error({ messageId, lockErr: lockErr?.message }, 'Failed to release wardrobe job lock');
//       }
//     }
//   }
// }

// export function launchWardrobeWorker(pollIntervalMs: number = 10_000): NodeJS.Timeout {
//   logger.info({ pollIntervalMs }, 'Launching wardrobe worker');
//   return setInterval(async () => {
//     try {
//       await processDueWardrobeJobs();
//     } catch (err: any) {
//       logger.error({ err: err?.message }, 'Wardrobe worker iteration failed');
//     }
//   }, pollIntervalMs);
// }

// const WardrobeItemAttributesSchema = z.object({
//   style: z.string().nullable().describe("The overall style of the item (e.g., 'bohemian', 'classic', 'minimalist')."),
//   pattern: z.string().nullable().describe("The pattern of the item (e.g., 'floral', 'striped', 'plaid')."),
//   color_primary: z.string().describe("The dominant color of the item."),
//   color_secondary: z.string().nullable().describe("The secondary color of the item, if applicable."),
//   material: z.string().nullable().describe("The material of the item (e.g., 'cotton', 'denim', 'silk')."),
//   fit: z.string().nullable().describe("The fit of the item (e.g., 'slim', 'relaxed', 'oversized')."),
//   length: z.string().nullable().describe("The length of the item (e.g., 'cropped', 'midi', 'maxi')."),
//   details: z.string().nullable().describe("Any other specific details (e.g., 'ruffles', 'embroidery')."),
// });

// const WardrobeItemSchema = z.object({
//   category: z.enum(['top', 'bottom', 'outerwear', 'shoes', 'accessory']).describe("The broad category of the clothing item."),
//   type: z.string().describe("The specific type of the item (e.g., 't-shirt', 'jeans', 'sneakers')."),
//   subtype: z.string().nullable().describe("A more specific subtype, if applicable (e.g., 'v-neck' for a t-shirt)."),
//   attributes: WardrobeItemAttributesSchema.describe("A set of descriptive attributes for the item."),
// });

// const LLMOutputSchema = z.object({
//   status: z.enum(['ok', 'bad_photo']).describe("The status of the image analysis. 'ok' if successful, 'bad_photo' if the image is unusable."),
//   items: z.array(WardrobeItemSchema).describe("An array of wardrobe items identified in the image."),
// });

// type WardrobeIndexResponse = z.infer<typeof LLMOutputSchema>;

// async function indexWardrobeFromMessage(messageId: string): Promise<void> {
//   const message = await prisma.message.findUnique({
//     where: { id: messageId },
//     include: { user: true },
//   });

//   if (!message || message.wardrobeProcessed) {
//     logger.debug({ messageId }, 'Message not found or already processed');
//     return;
//   }
//   logger.info({ messageId, userId: message.userId }, `Indexing wardrobe for message`);

//   const content = message.content as any[];
//   const imagePart = content.find((part: any) => part.type === 'image_url');

//   if (!imagePart) {
//     await prisma.message.update({ where: { id: messageId }, data: { wardrobeProcessed: true } });
//     logger.debug({ messageId }, 'No image in message, marked as processed');
//     return;
//   }

//   try {
//     const systemPrompt = await loadPrompt('wardrobe_index.txt');
//     const llm = getVisionLLM();

//     const promptTemplate = ChatPromptTemplate.fromMessages([
//       ["system", systemPrompt],
//       new MessagesPlaceholder("history"),
//     ]);

//     const history = [new HumanMessage({ content })];

//     const formattedPrompt = await promptTemplate.invoke({ history });
//     const output = (await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages())) as WardrobeIndexResponse;

//     logger.debug({ messageId, output }, 'LLM returned wardrobe items');

//     const items = output.items ?? [];
//     if (output.status === 'bad_photo') {
//       logger.warn({ messageId }, 'LLM classified image as a bad photo, skipping item creation');
//     } else {
//       logger.debug({ itemsCount: items.length }, 'Processing wardrobe items');

//       let createdCount = 0;
//       for (const item of items) {
//         const displayName = `${item.type}`;
//         const nameLower = toNameLower(displayName);
//         const existing = await prisma.wardrobeItem.findFirst({
//           where: {
//             userId: message.userId,
//             nameLower,
//             category: item.category,
//           },
//         });
//         if (!existing) {
//           createdCount++;
//           const colors: string[] = [item.attributes.color_primary, item.attributes.color_secondary].filter(Boolean) as string[];
//           await prisma.wardrobeItem.create({
//             data: {
//               userId: message.userId,
//               name: displayName,
//               nameLower,
//               category: item.category,
//               colors,
//               type: item.type,
//               subtype: item.subtype ?? null,
//               attributes: item.attributes,
//             },
//           });
//         }
//       }
//       logger.info({ messageId, createdCount, foundCount: items.length }, 'Wardrobe item processing complete');
//     }

//     await prisma.message.update({ where: { id: messageId }, data: { wardrobeProcessed: true } });
//     logger.info({ messageId, itemCount: items.length }, 'Wardrobe indexing complete');
//   } catch (err: any) {
//     logger.error({ messageId, err: err?.message, stack: err.stack }, 'Wardrobe indexing failed');
//     // Optionally, don't mark as processed to retry, or mark with error
//   }
// }
