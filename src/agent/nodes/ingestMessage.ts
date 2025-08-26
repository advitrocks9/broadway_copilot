import prisma from '../../db/client';
import { getOrCreateUserByWaId } from '../../utils/user';
import { downloadTwilioMedia, ensureVisionFileId } from '../../utils/media';
import { userUploadDir } from '../../utils/paths';
import { RunInput } from '../state';
import { getLogger } from '../../utils/logger';

/**
 * Normalizes Twilio webhook payload into RunInput and records a user turn.
 */
const logger = getLogger('node:ingest_message');
type IngestState = { input: Record<string, unknown> };

export async function ingestMessageNode(state: IngestState): Promise<{ input?: RunInput & { _runGen?: number }; reply?: string }>{
  const twilioBody = state.input as Record<string, unknown>;
  const from: string = (twilioBody?.From || '').toString();
  const bodyText: string | undefined = (twilioBody?.Body || '').toString() || undefined;
  const buttonPayload: string | undefined = (twilioBody?.ButtonPayload || '').toString() || undefined;
  const numMedia: number = Number(twilioBody?.NumMedia || 0);
  const mediaUrl0: string | undefined = (twilioBody?.MediaUrl0 || '').toString() || undefined;

  if (!from) {
    return { reply: 'Invalid request: missing sender.' };
  }

  const waId = from;
  const user = await getOrCreateUserByWaId(waId);

  let imagePath: string | undefined = undefined;
  let fileId: string | undefined = undefined;
  if (numMedia > 0 && mediaUrl0) {
    try {
      const dir = userUploadDir(waId.replace(/[^\w+]/g, '_'));
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

  const normalized: RunInput & { _runGen?: number } = {
    userId: user.id,
    waId,
    text: bodyText,
    imagePath,
    fileId,
    buttonPayload,
    gender: (user.confirmedGender as 'male' | 'female' | null) ?? (user.inferredGender as 'male' | 'female' | null) ?? null,
  };
  if (typeof (twilioBody as any)?._runGen === 'number') {
    (normalized as any)._runGen = (twilioBody as any)._runGen;
  }

  return { input: normalized };
}


