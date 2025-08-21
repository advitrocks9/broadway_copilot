import { RunInput } from '../state';
import { getLogger } from '../../utils/logger';

/**
 * Checks for image presence; routes to required vision node or asks for upload.
 */
const logger = getLogger('node:check_image');
export async function checkImageNode(state: { input: RunInput; intent?: string }): Promise<{ next?: string; replies?: Array<{ reply_type: 'text'; reply_text: string }> }> {
  const { input, intent } = state;
  const target: 'vibe_check' | 'color_analysis' | undefined =
    intent === 'vibe_check' ? 'vibe_check' : intent === 'color_analysis' ? 'color_analysis' : undefined;

  if ((input.fileId || input.imagePath) && target) {
    logger.info({ target }, 'CheckImage: image present; routing');
    return { next: target };
  }

  if (!target) {
    logger.info('CheckImage: no target; sending reply');
    return { next: 'send_reply', replies: [{ reply_type: 'text', reply_text: 'Tell me what you need help with.' }] };
  }

  const askText = target === 'color_analysis'
    ? 'Please upload a clear, well-lit portrait (face and hair visible) for color analysis.'
    : 'Please upload a photo of your outfit for a quick vibe check.';
  logger.info({ target }, 'CheckImage: requesting upload');
  return { next: 'send_reply', replies: [{ reply_type: 'text', reply_text: askText }] };
}
