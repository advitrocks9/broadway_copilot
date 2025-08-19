import { RunInput } from '../state';

/**
 * Checks for image presence; routes to required vision node or asks for upload.
 */
export async function checkImageNode(state: { input: RunInput; intent?: string }): Promise<{ next?: string; replies?: Array<{ reply_type: 'text'; reply_text: string }> }> {
  const { input, intent } = state;
  const target: 'vibe_check' | 'color_analysis' | undefined =
    intent === 'vibe_check' ? 'vibe_check' : intent === 'color_analysis' ? 'color_analysis' : undefined;

  if ((input.fileId || input.imagePath) && target) {
    console.log('🖼️ [CHECK_IMAGE] Image present; routing to', target);
    return { next: target };
  }

  if (!target) {
    console.log('🖼️ [CHECK_IMAGE] No target; sending reply');
    return { next: 'send_reply', replies: [{ reply_type: 'text', reply_text: 'Tell me what you need help with.' }] };
  }

  const askText = target === 'color_analysis'
    ? 'Please upload a clear, well-lit portrait (face and hair visible) for color analysis.'
    : 'Please upload a photo of your outfit for a quick vibe check.';
  console.log('🖼️ [CHECK_IMAGE] Requesting upload for', target);
  return { next: 'send_reply', replies: [{ reply_type: 'text', reply_text: askText }] };
}
