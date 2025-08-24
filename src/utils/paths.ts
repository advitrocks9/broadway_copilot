import { promises as fsp } from 'fs';
import path from 'path';

/**
 * Filesystem helpers for uploads directory handling.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true });
}

export function uploadsDir(): string {
  return path.resolve(process.cwd(), 'uploads');
}

export function userUploadDir(waId: string): string {
  const dir = path.join(uploadsDir(), waId);
  return dir;
}

export function staticUploadsMount(): string {
  return uploadsDir();
}
