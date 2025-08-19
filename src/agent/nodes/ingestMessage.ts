import prisma from '../../db/client';
import { getOrCreateUserByWaId } from '../../utils/user';
import { downloadTwilioMedia } from '../../utils/media';
import { userUploadDir } from '../../utils/paths';
import { RunInput } from '../state';
import { ensureVisionFileId } from '../../utils/media';

/**
 * Normalizes Twilio webhook payload into RunInput and records a user turn.
 */
type IngestState = { input: Record<string, unknown> };

export async function ingestMessageNode(state: IngestState): Promise<{ input?: RunInput; reply?: string }>{
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
    },
  });

  const normalized: RunInput = {
    userId: user.id,
    waId,
    text: bodyText,
    imagePath,
    fileId,
    buttonPayload,
    gender: (user.confirmedGender as 'male' | 'female' | null) ?? (user.inferredGender as 'male' | 'female' | null) ?? null,
  };

  return { input: normalized };
}


