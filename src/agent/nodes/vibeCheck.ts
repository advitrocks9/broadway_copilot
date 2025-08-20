import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { VibeCheckResponse, VibeCheckResponseSchema } from '../../types/contracts';
import { callResponsesWithSchema } from '../../utils/openai';
import { ensureVisionFileId, persistUpload } from '../../utils/media';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
export async function vibeCheckNode(state: { input: RunInput; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input, intent } = state;
  const imagePath = input.imagePath as string;
  const ensuredFileId = await ensureVisionFileId(imagePath, input.fileId);
  const upload = await persistUpload(input.userId, imagePath, ensuredFileId);
  const schema = VibeCheckResponseSchema as unknown as z.ZodType<VibeCheckResponse>;
  const prompt = loadPrompt('vibe_check.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (reflect in fit notes when applicable).` },
    { role: 'system', content: `Intent: ${intent || 'vibe_check'}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  console.log('👗 [VIBE_CHECK:INPUT]', { hasImage: true });
  const result = await callResponsesWithSchema<VibeCheckResponse>({
    messages: content as any,
    schema,
    model: 'gpt-5',
  });
  console.log('👗 [VIBE_CHECK:OUTPUT]', result);
  if ((result as any).__tool_calls) {
    const tc = (result as any).__tool_calls;
    console.log('👗 [VIBE_CHECK:TOOLS]', { total: tc.total, names: tc.names });
  }
  await prisma.vibeCheck.create({
    data: {
      uploadId: upload.id,
      fit_silhouette: null,
      color_harmony: null,
      styling_details: null,
      accessories_texture: null,
      context_confidence: null,
      overall_score: typeof result.overall_score === 'number' ? result.overall_score : null,
      comment: result.reply,
      rawJson: result as unknown as z.infer<typeof schema>,
    },
  });
  await prisma.user.update({
    where: { id: input.userId },
    data: { lastVibeCheckAt: new Date() },
  });
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: result.reply }];
  if (result.followup) replies.push({ reply_type: 'text', reply_text: result.followup });
  return { replies };
}

