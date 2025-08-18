import prisma from '../db/client';
import { uploadImageToOpenAI } from '../services/mediaService';

/**
 * Ensures an OpenAI Files API id exists for a given local image path.
 */
export async function ensureVisionFileId(imagePath?: string, existingFileId?: string): Promise<string | undefined> {
  if (existingFileId) return existingFileId;
  if (!imagePath) return undefined;
  return uploadImageToOpenAI(imagePath);
}

/**
 * Persists an upload row for analytics and joins.
 */
export async function persistUpload(userId: string, imagePath: string, fileId?: string) {
  return prisma.upload.create({ data: { userId, imagePath, fileId: fileId ?? null } });
}


