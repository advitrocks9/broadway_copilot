import { extension as extFromMime } from 'mime-types';
import { randomUUID } from 'crypto';
import { getLogger } from './logger';
import fs from 'fs/promises';
import path from 'path';
import { ensureDir, userUploadDir } from './paths';

const logger = getLogger('utils:media');

const twilioAuth = {
  sid: process.env.TWILIO_ACCOUNT_SID || '',
  token: process.env.TWILIO_AUTH_TOKEN || '',
};

/**
 * Downloads media from Twilio and saves it locally
 * @param url - Twilio media URL
 * @param waId - WhatsApp ID for user directory
 * @param mimeType - MIME type (e.g., 'image/jpeg')
 * @returns Public URL to the downloaded file
 */
export async function downloadTwilioMedia(
  url: string,
  waId: string,
  mimeType: string
): Promise<string> {
  if (!twilioAuth.sid || !twilioAuth.token) {
    throw new Error('Twilio credentials missing');
  }
  if (!mimeType) throw new Error('MIME type is required');

  const extension = extFromMime(mimeType);
  const filename = `twilio_${randomUUID()}${extension ? `.${extension}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioAuth.sid}:${twilioAuth.token}`).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const uploadDir = userUploadDir(waId);
  await ensureDir(uploadDir);
  const filePath = path.join(uploadDir, filename);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));

  logger.info({ filePath, mimeType }, 'Twilio media saved locally');

  return `${process.env.SERVER_URL}/uploads/${waId}/${filename}`;
}
