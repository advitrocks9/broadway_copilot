import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { ColorAnalysis, ColorAnalysisSchema } from '../../types/contracts';
import { getVisionLLM } from '../../services/openaiService';
import { ensureVisionFileId, persistUpload } from '../../utils/media';
import { getLogger } from '../../utils/logger';

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 */
const logger = getLogger('node:color_analysis');

export async function colorAnalysisNode(state: { input: RunInput; intent?: string; messages?: unknown[] }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input, intent } = state;
  const imagePath = input.imagePath as string;
  const ensuredFileId = await ensureVisionFileId(imagePath, input.fileId);
  const upload = await persistUpload(input.userId, imagePath, ensuredFileId);
  const schema = ColorAnalysisSchema as unknown as z.ZodType<ColorAnalysis>;
  const prompt = await loadPrompt('color_analysis.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (adjust color guidance if relevant).` },
    { role: 'system', content: `Intent: ${intent || 'color_analysis'}` },
    { role: 'system', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  logger.info({ hasImage: true }, 'ColorAnalysis: input');
  const result = await getVisionLLM().withStructuredOutput(schema as any).invoke(content as any) as ColorAnalysis;
  logger.info(result, 'ColorAnalysis: output');
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
  await prisma.user.update({
    where: { id: input.userId },
    data: { lastColorAnalysisAt: new Date() },
  });
  const palette = result.palette_name ? `${result.palette_name}` : 'Unknown palette';
  const descParts: string[] = [];
  if (result.skin_tone?.name) descParts.push(`skin: ${result.skin_tone.name}`);
  if (result.eye_color?.name) descParts.push(`eyes: ${result.eye_color.name}`);
  if (result.hair_color?.name) descParts.push(`hair: ${result.hair_color.name}`);
  if (result.undertone) descParts.push(`undertone: ${result.undertone}`);
  const description = descParts.join(', ');
  const top3 = (result.top3_colors || []).map(c => c.name).join(', ');
  const bottom3 = (result.avoid3_colors || []).map(c => c.name).join(', ');
  const lines: string[] = [
    'Color Analysis',
    `- Palette: ${palette}`,
    `- Description: ${description || 'N/A'}`,
    `- Comment: ${result.palette_comment ?? 'N/A'}`,
    `- Top 3: ${top3 || 'N/A'}`,
    `- Bottom 3: ${bottom3 || 'N/A'}`,
  ];
  const combinedText = [lines.join('\n'), result.reply_text].filter(Boolean).join('\n\n');
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [
    { reply_type: 'text', reply_text: combinedText },
  ];
  if (result.followup_text) replies.push({ reply_type: 'text', reply_text: result.followup_text });
  return { replies };
}
