import { RunInput } from '../state';
import prisma from '../../db/client';
import { loadPrompt } from '../../utils/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { OutfitRatingGood, OutfitRatingGoodSchema } from '../../types/contracts';
import { uploadImageToOpenAI } from '../../services/mediaService';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
export async function vibeCheckNode(state: { input: RunInput; intent?: string }): Promise<{ reply: { reply_type: 'text'; reply_text: string }; postAction: 'followup' }>{
  const llm = new ChatOpenAI({ model: 'gpt-5', useResponsesApi: true , reasoning: { effort: "minimal" }  });
  const { input, intent } = state;
  const imagePath = input.imagePath as string;
  const ensuredFileId = input.fileId || (imagePath ? await uploadImageToOpenAI(imagePath) : undefined);
  const upload = await prisma.upload.create({ data: { userId: input.userId, imagePath, fileId: ensuredFileId || null } });
  const schema = OutfitRatingGoodSchema as unknown as z.ZodType<OutfitRatingGood>;
  const prompt = loadPrompt('vibe_check.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'system', content: `Intent: ${intent || 'vibe_check'}` },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  console.log('👗 [VIBE_CHECK:INPUT]', { hasImage: true });
  const result = await llm.withStructuredOutput(schema).invoke(content) as OutfitRatingGood;
  console.log('👗 [VIBE_CHECK:OUTPUT]', result);
  await prisma.vibeCheck.create({
    data: {
      uploadId: upload.id,
      fit_silhouette: result.fit_silhouette,
      color_harmony: result.color_harmony,
      styling_details: result.styling_details,
      accessories_texture: result.accessories_texture ?? null,
      context_confidence: result.context_confidence,
      overall_score: result.overall_score,
      comment: result.comment,
      rawJson: result as unknown as z.infer<typeof schema>,
    },
  });
  const overall = result.overall_score as number;
  const comment = result.comment as string;
  const replyText = `Vibe check: ${overall.toFixed(1)}/10. ${comment}`;
  return { reply: { reply_type: 'text', reply_text: replyText }, postAction: 'followup' };
}

