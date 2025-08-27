import prisma from '../db/client';
import { getLogger } from './logger';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ensureDir } from './paths';
import { OpenAIFileResponse } from '../types/common';

/**
 * Media utilities for handling image uploads and downloads.
 */
const logger = getLogger('utils:media');

const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';

/**
 * Determines file extension from content type header.
 * @param contentType - The content type string from HTTP headers
 * @returns The appropriate file extension (e.g., '.jpg', '.png')
 */
function extensionFromContentType(contentType: string | undefined): string {
  if (!contentType) return '';
  const map: Record<string, string> = {
    jpeg: '.jpg',
    jpg: '.jpg',
    png: '.png',
    webp: '.webp',
    gif: '.gif',
  };
  const lower = contentType.toLowerCase();
  for (const key of Object.keys(map)) {
    if (lower.includes(key)) return map[key];
  }
  return '';
}

/**
 * Downloads media from Twilio and saves it to the specified directory.
 */
export async function downloadTwilioMedia(url: string, dir: string, suggestedExt?: string): Promise<string> {
  if (!accountSid || !authToken) throw new Error('Twilio credentials missing');
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) throw new Error(`Failed to download media: ${res.status}`);
  const ct = res.headers.get('content-type') || undefined;
  const ext = suggestedExt || extensionFromContentType(ct) || path.extname(new URL(url).pathname) || '';
  const filename = `twilio_${Date.now()}${ext}`;
  await ensureDir(dir);
  const filePath = path.join(dir, filename);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(filePath, buf);
  logger.info({ filePath }, 'Downloaded Twilio media');
  return filePath;
}

/**
 * Uploads an image file to OpenAI's Files API for vision processing.
 */
export async function uploadImageToOpenAI(filePath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  const client = new OpenAI({ apiKey });
  const stream = fs.createReadStream(filePath);
  const uploaded = await client.files.create({ file: stream as any, purpose: 'vision' as any });
  logger.info({ filePath }, 'Uploaded image to OpenAI');
  const response = uploaded as OpenAIFileResponse;
  return response.id;
}

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
  const row = await prisma.upload.create({ data: { userId, imagePath, fileId: fileId ?? null } });
  logger.info({ uploadId: row.id, userId }, 'Persisted upload');
  return row;
}


