import { promises as fsp } from 'fs';
import path from 'path';

import { createError } from './errors';
import { logger } from './logger';

/**
 * Filesystem helpers for uploads directory handling.
 */

/**
 * Ensures a directory exists, creating it recursively if necessary.
 *
 * @param dirPath - The directory path to create
 * @throws {HttpError} When directory path is missing or creation fails
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!dirPath) {
    throw createError.badRequest('Directory path is required');
  }

  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    logger.error({ dirPath, err: err.message, stack: err.stack }, 'Error ensuring directory');
    if (err.statusCode) {
      throw err; // Re-throw HTTP errors as-is
    }
    throw createError.internalServerError('Failed to create directory');
  }
}

/**
 * Gets the absolute path to the uploads directory.
 *
 * @returns Absolute path to the uploads directory
 */
function uploadsDir(): string {
  return path.resolve(process.cwd(), 'uploads');
}

/**
 * Gets the upload directory path for a specific WhatsApp user.
 *
 * @param waId - WhatsApp user ID (e.g., "whatsapp:+1234567890")
 * @returns Absolute path to the user's upload directory
 * @throws {HttpError} When WhatsApp ID is missing
 */
export function userUploadDir(waId: string): string {
  if (!waId) {
    throw createError.badRequest('WhatsApp ID is required');
  }
  return path.join(uploadsDir(), waId);
}

/**
 * Gets the mount point for serving static upload files.
 *
 * @returns Absolute path to the uploads directory for static file serving
 */
export function staticUploadsMount(): string {
  return uploadsDir();
}
