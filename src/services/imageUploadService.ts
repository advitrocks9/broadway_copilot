// import fs from 'fs/promises';
// import path from 'path';

// import mime from 'mime-types';
// import { Storage } from '@google-cloud/storage';

// import { prisma } from '../lib/prisma';
// import { createError } from '../utils/errors';
// import { staticUploadsMount } from '../utils/paths';
// import { logger }  from '../utils/logger';

// const storage = new Storage();
// const bucketName = process.env.GOOGLE_CLOUD_BUCKET;
// if (!bucketName) {
//   throw createError.internalServerError('GOOGLE_CLOUD_BUCKET not set');
// }
// const bucket = storage.bucket(bucketName);

// async function processPendingImageUploads(batchSize: number = 50): Promise<void> {
//   logger.info({ batchSize }, 'Checking for pending image uploads...');

//   try {
//     const pendingMessages = await prisma.message.findMany({
//       where: {
//         hasImage: true,
//         imageArchived: false,
//       },
//       orderBy: { createdAt: 'asc' },
//       take: batchSize,
//       select: { id: true, content: true },
//     });

//     if (pendingMessages.length > 0) {
//       logger.info({ count: pendingMessages.length }, `Found ${pendingMessages.length} pending image uploads`);
//     }

//     let successful = 0;

//     for (const msg of pendingMessages) {
//       try {
//         const content = msg.content as any[];
//         const imagePartIndex = content.findIndex((part: any) => part.type === 'image_url');
//         if (imagePartIndex === -1) continue;

//         const imagePart = content[imagePartIndex];
//         const currentUrl = imagePart.image_url?.url;
//         if (!currentUrl) continue;

//         const baseUrl = (process.env.SERVER_URL || '').replace(/\/$/, '');
//         if (!currentUrl.startsWith(`${baseUrl}/uploads/`)) continue;

//         const relativePath = currentUrl.replace(baseUrl + '/', '');
//         const localPath = path.join(staticUploadsMount(), relativePath.replace('uploads/', ''));

//         const fileBuffer = await fs.readFile(localPath);

//         const contentType = mime.lookup(localPath) || 'application/octet-stream';

//         const gcsFile = bucket.file(relativePath);
//         await gcsFile.save(fileBuffer, {
//           contentType,
//           metadata: { cacheControl: 'private, max-age=31536000' },
//         });

//         await prisma.message.update({
//           where: { id: msg.id },
//           data: {
//             imageArchived: true,
//           },
//         });

//         successful++;
//         logger.info({ messageId: msg.id }, 'Image uploaded to GCS');
//       } catch (err: any) {
//         logger.error({ messageId: msg.id, err: err?.message, stack: err?.stack }, 'Failed to upload image to GCS');
//       }
//     }

//     if (pendingMessages.length > 0) {
//       logger.info({ successful, total: pendingMessages.length }, `Successfully uploaded ${successful} out of ${pendingMessages.length} images`);
//     }
//   } catch (err: any) {
//     logger.error({ err: err?.message, stack: err?.stack }, 'Failed to process pending image uploads');
//   } finally {
//     logger.info('Finished image upload cycle');
//   }
// }

// export function launchImageUploadWorker(intervalMs: number = 15 * 60 * 1000): NodeJS.Timeout {
//   logger.info({ intervalMs }, 'Launching image upload worker');
//   processPendingImageUploads(); // Initial run
//   return setInterval(() => {
//     processPendingImageUploads();
//   }, intervalMs);
// }
