import prisma from '../../db/client';
import { RunInput } from '../state';
import { getOrCreateUserByWaId } from '../../utils/user';
import { downloadTwilioMedia, ensureVisionFileId } from '../../utils/media';
import { userUploadDir } from '../../utils/paths';
import { sanitizeWaIdForFilesystem } from '../../utils/text';
import { getLogger } from '../../utils/logger';

/**
 * Normalizes Twilio webhook payload into RunInput and records a user turn.
 */
const logger = getLogger('node:ingest_message');

/**
 * Safely extracts a string value from Twilio webhook payload.
 */
function extractString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body?.[key];
  return value ? value.toString() : undefined;
}

/**
 * Safely extracts a number value from Twilio webhook payload.
 */
function extractNumber(body: Record<string, unknown>, key: string): number {
  const value = body?.[key];
  return Number(value || 0);
}

interface IngestMessageState {
  input: Record<string, unknown>;
}

interface IngestMessageResult {
  input?: RunInput;
  reply?: string;
}

export async function ingestMessageNode(state: IngestMessageState): Promise<IngestMessageResult> {
  const twilioBody = state.input as Record<string, unknown>;
  const from: string = extractString(twilioBody, 'From') || '';
  const bodyText: string | undefined = extractString(twilioBody, 'Body');
  const buttonPayload: string | undefined = extractString(twilioBody, 'ButtonPayload');
  const numMedia: number = extractNumber(twilioBody, 'NumMedia');
  const mediaUrl0: string | undefined = extractString(twilioBody, 'MediaUrl0');

  if (!from) {
    return { reply: 'Invalid request: missing sender.' };
  }

  const waId = from;
  const user = await getOrCreateUserByWaId(waId);

  let imagePath: string | undefined = undefined;
  let fileId: string | undefined = undefined;
  if (numMedia > 0 && mediaUrl0) {
    try {
      const dir = userUploadDir(sanitizeWaIdForFilesystem(waId));
      imagePath = await downloadTwilioMedia(mediaUrl0, dir);
      fileId = await ensureVisionFileId(imagePath);
    } catch (err) {
      logger.error({ err }, 'IngestMessage: failed to download/process media');
      return { reply: 'I had a problem downloading the image. Please try again.' };
    }
  }

  await prisma.turn.create({
    data: {
      userId: user.id,
      role: 'user',
      text: bodyText || null,
      imagePath: imagePath || null,
      fileId: fileId || null,
      metadata: buttonPayload ? { buttonPayload } : undefined,
    },
  });
  logger.info({ userId: user.id, waId, hasImage: Boolean(imagePath), hasText: Boolean(bodyText) }, 'Ingested user turn');

  const normalized: RunInput = {
    userId: user.id,
    waId,
    text: bodyText,
    imagePath,
    fileId,
    buttonPayload,
    gender: (user.confirmedGender as 'male' | 'female' | null) ?? (user.inferredGender as 'male' | 'female' | null) ?? null,
  };

  // Extract runGen from twilio body
  const runGen = (twilioBody as { runGen?: number })?.runGen;
  if (typeof runGen === 'number') {
    normalized.runGen = runGen;
  }

  return { input: normalized };
}