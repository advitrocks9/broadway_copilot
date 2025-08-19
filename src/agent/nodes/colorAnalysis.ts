import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { ColorAnalysis, ColorAnalysisSchema } from '../../types/contracts';
import { callResponsesWithSchema } from '../../utils/openai';
import { ensureVisionFileId, persistUpload } from '../../utils/media';

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 */

export async function colorAnalysisNode(state: { input: RunInput; intent?: string }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input, intent } = state;
  const imagePath = input.imagePath as string;
  const ensuredFileId = await ensureVisionFileId(imagePath, input.fileId);
  const upload = await persistUpload(input.userId, imagePath, ensuredFileId);
  const schema = ColorAnalysisSchema as unknown as z.ZodType<ColorAnalysis>;
  const prompt = loadPrompt('color_analysis.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (adjust color guidance if relevant).` },
    { role: 'system', content: `Intent: ${intent || 'color_analysis'}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  console.log('🎨 [COLOR_ANALYSIS:INPUT]', { hasImage: true });
  const result = await callResponsesWithSchema<ColorAnalysis>({
    messages: content as any,
    schema,
    model: 'gpt-5',
  });
  console.log('🎨 [COLOR_ANALYSIS:OUTPUT]', result);
  if ((result as any).__tool_calls) {
    const tc = (result as any).__tool_calls;
    console.log('🎨 [COLOR_ANALYSIS:TOOLS]', { total: tc.total, names: tc.names });
  }
  await prisma.colorAnalysis.create({
    data: {
      uploadId: upload.id,
      skin_tone: result.skin_tone?.name ?? null,
      eye_color: result.eye_color?.name ?? null,
      hair_color: result.hair_color?.name ?? null,
      top3_colors: result.top3_colors as unknown as z.infer<typeof schema>['top3_colors'],
      avoid3_colors: result.avoid3_colors as unknown as z.infer<typeof schema>['avoid3_colors'],
      rawJson: result as unknown as z.infer<typeof schema>,
    },
  });
  const primary = result.reply_text;
  const follow = result.followup_text || null;
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: primary }];
  if (follow) replies.push({ reply_type: 'text', reply_text: follow });
  return { replies };
}
