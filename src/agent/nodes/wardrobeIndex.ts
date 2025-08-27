import { z } from 'zod';

import prisma from '../../db/client';
import { RunInput } from '../state';
import { WardrobeIndexResponseSchema, WardrobeIndexResponse } from '../../types/contracts';
import { getVisionLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { toNameLower } from '../../utils/text';
import { ensureVisionFileId } from '../../utils/media';
import { getLogger } from '../../utils/logger';

/**
 * Indexes wardrobe items from an image to persist context for future chats.
 */
const logger = getLogger('node:wardrobe_index');

interface WardrobeIndexState {
  input: RunInput;
}

interface WardrobeIndexResult extends Record<string, never> {}

export async function wardrobeIndexNode(state: WardrobeIndexState): Promise<WardrobeIndexResult> {
  const { input } = state;
  const imagePath = input.imagePath as string;
  if (!imagePath) {
    return {};
  }
  const ensuredFileId = await ensureVisionFileId(imagePath, input.fileId);
  const schema = WardrobeIndexResponseSchema as unknown as z.ZodType<WardrobeIndexResponse>;
  const prompt = await loadPrompt('wardrobe_index.txt');

  type VisionPart = { type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' };
  type VisionContent = string | VisionPart[];

  const content: Array<{ role: 'system' | 'user'; content: VisionContent }> = [
    { role: 'system', content: prompt },
    { role: 'user', content: [{ type: 'input_image', file_id: ensuredFileId as string, detail: 'high' }] },
  ];
  logger.info({ hasImage: true }, 'WardrobeIndex: input');
  logger.debug({ content }, 'WardrobeIndex: model input');
  let result: WardrobeIndexResponse;
  try {
    result = await getVisionLLM().withStructuredOutput(schema as any).invoke(content as any) as WardrobeIndexResponse;
  } catch (err: any) {
    logger.error({ message: err?.message }, 'WardrobeIndex: error');
    return {};
  }
  if (result.status === 'bad_photo') {
    logger.info({ status: 'bad_photo', itemsCount: 0 }, 'WardrobeIndex: output');
    return {};
  }
  const items = result.items ?? [];
  logger.info({ status: 'ok', itemsCount: Array.isArray(items) ? items.length : 0 }, 'WardrobeIndex: output');
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
          colors: colors,
          type: item.type,
          subtype: item.subtype ?? null,
          attributes: item.attributes,
        },
      });
    }
  }
  return {};
}


