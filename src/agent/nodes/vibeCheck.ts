import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { VibeCheckResponse, VibeCheckResponseSchema } from '../../types/contracts';
import { getVisionLLM } from '../../services/openaiService';
import { ensureVisionFileId, persistUpload } from '../../utils/media';
import { getLogger } from '../../utils/logger';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
const logger = getLogger('node:vibe_check');
export async function vibeCheckNode(state: { input: RunInput; intent?: string; messages?: unknown[]; latestColorAnalysis?: unknown }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
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
    { role: 'system', content: `LatestColorAnalysis: ${JSON.stringify(state.latestColorAnalysis || null)}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  logger.info({ hasImage: true }, 'VibeCheck: input');
  const result = await getVisionLLM().withStructuredOutput(schema as any).invoke(content as any) as VibeCheckResponse;
  logger.info(result, 'VibeCheck: output');
  const categories = Array.isArray(result.categories) ? result.categories : [];
  const byHeading: Record<string, number | undefined> = Object.fromEntries(
    categories.map((c: any) => [c.heading, typeof c.score === 'number' ? c.score : undefined])
  );
  await prisma.vibeCheck.create({
    data: {
      uploadId: upload.id,
      fit_silhouette: byHeading['Fit & Silhouette'] ?? null,
      color_harmony: byHeading['Color Harmony'] ?? null,
      styling_details: byHeading['Styling Details'] ?? null,
      accessories_texture: null,
      context_confidence: byHeading['Context & Confidence'] ?? null,
      overall_score: typeof result.vibe_score === 'number' ? result.vibe_score : null,
      comment: result.reply_text || result.vibe_reply,
      rawJson: result as unknown as z.infer<typeof schema>,
    },
  });
  await prisma.user.update({
    where: { id: input.userId },
    data: { lastVibeCheckAt: new Date() },
  });
  const scoreLines: string[] = [
    'Vibe Check',
    ...categories.map((c) => `- ${c.heading}: ${typeof c.score === 'number' ? c.score : 'N/A'}`),
    `- Overall: ${typeof result.vibe_score === 'number' ? result.vibe_score : 'N/A'}`,
    '',
  ];
  const combinedText = [scoreLines.join('\n'), result.reply_text].filter(Boolean).join('\n\n');
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [
    { reply_type: 'text', reply_text: combinedText },
  ];
  if (result.followup_text) replies.push({ reply_type: 'text', reply_text: result.followup_text });
  return { replies };
}

