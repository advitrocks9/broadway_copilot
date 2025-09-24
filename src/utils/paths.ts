import fs from 'fs/promises';
import path from 'path';

import { BadRequestError, HttpError, InternalServerError } from './errors';

export async function ensureDir(dirPath: string): Promise<void> {
  if (!dirPath) {
    throw new BadRequestError('Directory path is required');
  }
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new InternalServerError('Failed to create directory');
  }
}

function uploadsDir(): string {
  return path.resolve(process.cwd(), 'uploads');
}

export function userUploadDir(whatsappId: string): string {
  if (!whatsappId) {
    throw new BadRequestError('WhatsApp ID is required');
  }
  const sanitizedId = whatsappId.replace(/[^a-zA-Z0-9_+]/g, '_');
  return path.join(process.cwd(), 'uploads', sanitizedId);
}

export function staticUploadsMount(): string {
  return uploadsDir();
}
