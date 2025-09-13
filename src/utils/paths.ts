import fs from 'fs/promises';
import path from 'path';

import { BadRequestError, InternalServerError } from './errors';

/**
 * Filesystem helpers for uploads directory handling.
 */

/**
 * Ensures a directory exists, creating it recursively if necessary.
 *
 * @param dirPath - The directory path to create
 * @throws {BadRequestError} if path is empty
 * @throws {InternalServerError} if directory creation fails
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!dirPath) {
    throw new BadRequestError('Directory path is required');
  }
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.statusCode) {
      throw err; // Re-throw HTTP errors as-is
    }
    throw new InternalServerError('Failed to create directory');
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
 * @param whatsappId - WhatsApp user ID (e.g., "whatsapp:+1234567890")
 * @returns Absolute path to the user's upload directory
 * @throws {BadRequestError} if whatsappId is empty
 */
export function userUploadDir(whatsappId: string): string {
  if (!whatsappId) {
    throw new BadRequestError('WhatsApp ID is required');
  }
  const sanitizedId = whatsappId.replace(/[^a-zA-Z0-9_+]/g, '_');
  return path.join(process.cwd(), 'uploads', sanitizedId);
}

/**
 * Gets the mount point for serving static upload files.
 *
 * @returns Absolute path to the uploads directory for static file serving
 */
export function staticUploadsMount(): string {
  return uploadsDir();
}
