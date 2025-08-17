import prisma from '../../db/client';
import { getOrCreateUserByWaId } from '../../services/userService';
import { downloadTwilioMedia, uploadImageToOpenAI } from '../../services/mediaService';
import { userUploadDir } from '../../utils/paths';
import { RunInput } from '../state';
import { fetchLatestConversationMessages } from '../tools';

/**
 * Ingests the verified Twilio webhook payload and normalizes it into the agent's internal RunInput.
 * - Ensures the user exists
 * - Downloads media (if present)
 * - Creates a 'user' turn
 * - Returns { input: RunInput, userTurnId }
 */
type IngestState = { input: Record<string, unknown> };

export async function ingestMessageNode(state: IngestState): Promise<{ input?: RunInput; userTurnId?: string; reply?: string; messages?: Array<any> }>{
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
      fileId = await uploadImageToOpenAI(imagePath);
    } catch (err) {
      return { reply: 'I had a problem downloading the image. Please try again.' };
    }
  }

  const userTurn = await prisma.turn.create({
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
  };

  // Hydrate last 6 user + 6 assistant messages once for the whole graph
  const { messages } = await fetchLatestConversationMessages(user.id);

  return { input: normalized, userTurnId: userTurn.id, messages };
}


