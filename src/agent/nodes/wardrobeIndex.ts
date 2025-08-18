import { z } from 'zod';
import prisma from '../../db/client';
import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { toNameLower } from '../../utils/text';
import { WardrobeIndexResponseSchema, WardrobeIndexResponse } from '../../types/contracts';
import { getVisionLLM } from '../../utils/llm';
import { ensureVisionFileId } from '../../utils/media';
import type { Prisma } from '@prisma/client';

/**
 * Indexes wardrobe items from an image to persist context for future chats.
 */

export async function wardrobeIndexNode(state: { input: RunInput }): Promise<Record<string, never>> {
  const llm = getVisionLLM();
  const { input } = state;
  const imagePath = input.imagePath as string;
  if (!imagePath) {
    return {};
  }
  const ensuredFileId = await ensureVisionFileId(imagePath, input.fileId);
  const schema = WardrobeIndexResponseSchema as unknown as z.ZodType<WardrobeIndexResponse>;
  const prompt = loadPrompt('wardrobe_index.txt');
  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];
  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'user', content: [ { type: 'input_image', file_id: ensuredFileId as string, detail: 'high' } ] },
  ];
  console.log('🗂️ [WARDROBE_INDEX:INPUT]', { hasImage: true });
  let result: WardrobeIndexResponse;
  try {
    result = await llm.withStructuredOutput(schema).invoke(content) as WardrobeIndexResponse;
  } catch (err: any) {
    console.error('🗂️ [WARDROBE_INDEX:ERROR]', { message: err?.message });
    return {};
  }
  if (result.status === 'bad_photo') {
    console.log('🗂️ [WARDROBE_INDEX:OUTPUT]', { status: 'bad_photo', itemsCount: 0 });
    return {};
  }
  const items = result.items ?? [];
  console.log('🗂️ [WARDROBE_INDEX:OUTPUT]', { status: 'ok', itemsCount: Array.isArray(items) ? items.length : 0 });
  for (const item of items) {
    const displayName = `${item.type}`;
    const nameLower = toNameLower(displayName);
    const existing = await prisma.wardrobeItem.findFirst({ where: { userId: input.userId, nameLower, category: item.category } });
    if (!existing) {
      const colors: string[] = [item.attributes.color_primary, item.attributes.color_secondary].filter(Boolean) as string[];
      await prisma.wardrobeItem.create({
        data: {
          userId: input.userId,
          name: displayName,
          nameLower,
          category: item.category,
          colors: colors as any,
          type: item.type,
          subtype: item.subtype ?? null,
          attributes: item.attributes as any,
        },
      });
    }
  }
  return {};
}


