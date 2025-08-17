import fs from 'fs';
import path from 'path';

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function uploadsDir(): string {
  return path.resolve(process.cwd(), 'uploads');
}

export function userUploadDir(waId: string): string {
  const dir = path.join(uploadsDir(), waId);
  ensureDir(dir);
  return dir;
}

export function staticUploadsMount(): string {
  return uploadsDir();
}
