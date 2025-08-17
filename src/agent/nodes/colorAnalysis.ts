import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { ColorAnalysis, ColorAnalysisSchema } from '../../types/contracts';
import { formatColorReplySummary } from '../../utils/text';
import { uploadImageToOpenAI } from '../../services/mediaService';

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 */

export async function colorAnalysisNode(state: { input: RunInput; intent?: string }): Promise<{ reply: { reply_type: 'text'; reply_text: string }; postAction: 'followup' }>{
  const llm = new ChatOpenAI({ model: "gpt-5", useResponsesApi: true, reasoning: { effort: "minimal" } });
  const { input, intent } = state;
  const imagePath = input.imagePath as string;
  const ensuredFileId = input.fileId || (imagePath ? await uploadImageToOpenAI(imagePath) : undefined);
  const upload = await prisma.upload.create({ data: { userId: input.userId, imagePath, fileId: ensuredFileId || null } });
  const schema = ColorAnalysisSchema as unknown as z.ZodType<ColorAnalysis>;
  const prompt = loadPrompt('color_analysis.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `Intent: ${intent || 'color_analysis'}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  console.log('🎨 [COLOR_ANALYSIS:INPUT]', { hasImage: true });
  const result = await llm.withStructuredOutput(schema).invoke(content) as ColorAnalysis;
  console.log('🎨 [COLOR_ANALYSIS:OUTPUT]', result);
  await prisma.colorAnalysis.create({
    data: {
      uploadId: upload.id,
      skin_tone: result.skin_tone ?? null,
      eye_color: result.eye_color ?? null,
      hair_color: result.hair_color ?? null,
      top3_colors: result.top3_colors as unknown as z.infer<typeof schema>['top3_colors'],
      avoid3_colors: result.avoid3_colors as unknown as z.infer<typeof schema>['avoid3_colors'],
      rawJson: result as unknown as z.infer<typeof schema>,
    },
  });
  const replyText = formatColorReplySummary({
    skin_tone: result.skin_tone ?? undefined,
    eye_color: result.eye_color ?? undefined,
    hair_color: result.hair_color ?? undefined,
    top3_colors: result.top3_colors,
    avoid3_colors: result.avoid3_colors,
  });
  return { reply: { reply_type: 'text', reply_text: replyText }, postAction: 'followup' };
}
