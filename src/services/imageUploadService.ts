import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types';
import { Storage } from '@google-cloud/storage';
import prisma from '../lib/prisma';
import { getLogger } from '../utils/logger';
import { staticUploadsMount } from '../utils/paths';

const logger = getLogger('service:imageUpload');

const storage = new Storage();
const bucketName = process.env.GOOGLE_CLOUD_BUCKET;
if (!bucketName) {
  throw new Error('GOOGLE_CLOUD_BUCKET not set');
}
const bucket = storage.bucket(bucketName);

export async function processPendingImageUploads(batchSize: number = 50): Promise<void> {
  const pendingMessages = await prisma.message.findMany({
    where: {
      hasImage: true,
      imageArchived: false,
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: { id: true, content: true },
  });

  for (const msg of pendingMessages) {
    try {
      const content = msg.content as any[];
      const imagePartIndex = content.findIndex((part: any) => part.type === 'image_url');
      if (imagePartIndex === -1) continue;

      const imagePart = content[imagePartIndex];
      const currentUrl = imagePart.image_url?.url;
      if (!currentUrl) continue;

      const baseUrl = (process.env.SERVER_URL || '').replace(/\/$/, '');
      if (!currentUrl.startsWith(`${baseUrl}/uploads/`)) continue;

      const relativePath = currentUrl.replace(baseUrl + '/', '');
      const localPath = path.join(staticUploadsMount(), relativePath.replace('uploads/', ''));

      const fileBuffer = await fs.readFile(localPath);

      const contentType = mime.lookup(localPath) || 'application/octet-stream';

      const gcsFile = bucket.file(relativePath);
      await gcsFile.save(fileBuffer, {
        contentType,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      await gcsFile.makePublic();

      const gcsUrl = gcsFile.publicUrl();

      content[imagePartIndex].image_url.url = gcsUrl;

      await prisma.message.update({
        where: { id: msg.id },
        data: {
          content,
          imageArchived: true,
        },
      });

      await fs.unlink(localPath);

      logger.info({ messageId: msg.id, gcsUrl }, 'Image uploaded to GCS and local file deleted');
    } catch (err: any) {
      logger.error({ messageId: msg.id, err: err?.message }, 'Failed to upload image to GCS');
      // Continue to next, or you can break/retry logic
    }
  }
}

export function launchImageUploadWorker(intervalMs: number = 15 * 60 * 1000): NodeJS.Timeout {
  logger.info({ intervalMs }, 'Launching image upload worker');
  processPendingImageUploads(); // Initial run
  return setInterval(() => {
    processPendingImageUploads();
  }, intervalMs);
}

export default {
  processPendingImageUploads,
  launchImageUploadWorker,
};
