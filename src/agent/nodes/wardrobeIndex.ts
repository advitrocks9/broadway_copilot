import prisma from '../../lib/prisma';
import { getVisionLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { z } from 'zod';
import { toNameLower } from '../../utils/text';

/**
 * Indexes wardrobe items from an image to persist context for future chats.
 */
const logger = getLogger('node:wardrobe_index');

const WardrobeItemAttributesSchema = z.object({
  style: z.string().nullable().describe("The overall style of the item (e.g., 'bohemian', 'classic', 'minimalist')."),
  pattern: z.string().nullable().describe("The pattern of the item (e.g., 'floral', 'striped', 'plaid')."),
  color_primary: z.string().describe("The dominant color of the item."),
  color_secondary: z.string().nullable().describe("The secondary color of the item, if applicable."),
  material: z.string().nullable().describe("The material of the item (e.g., 'cotton', 'denim', 'silk')."),
  fit: z.string().nullable().describe("The fit of the item (e.g., 'slim', 'relaxed', 'oversized')."),
  length: z.string().nullable().describe("The length of the item (e.g., 'cropped', 'midi', 'maxi')."),
  details: z.string().nullable().describe("Any other specific details (e.g., 'ruffles', 'embroidery')."),
});

const WardrobeItemSchema = z.object({
  category: z.enum(['top', 'bottom', 'outerwear', 'shoes', 'accessory']).describe("The broad category of the clothing item."),
  type: z.string().describe("The specific type of the item (e.g., 't-shirt', 'jeans', 'sneakers')."),
  subtype: z.string().nullable().describe("A more specific subtype, if applicable (e.g., 'v-neck' for a t-shirt)."),
  attributes: WardrobeItemAttributesSchema.describe("A set of descriptive attributes for the item."),
});

const LLMOutputSchema = z.object({
  status: z.enum(['ok', 'bad_photo']).describe("The status of the image analysis. 'ok' if successful, 'bad_photo' if the image is unusable."),
  items: z.array(WardrobeItemSchema).describe("An array of wardrobe items identified in the image."),
});

type WardrobeIndexResponse = z.infer<typeof LLMOutputSchema>;


export async function wardrobeIndexNode(state: any) {

  if (numImagesInMessage(state.conversationHistoryWithImages) === 0) {
    return {};
  }

  try {
    const systemPrompt = await loadPrompt('wardrobe_index');
    const llm = getVisionLLM();

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    let history = state.conversationHistoryWithImages

    const formattedPrompt = await promptTemplate.invoke({ history });
    const output = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as WardrobeIndexResponse;

    logger.debug({ messageId: state.conversationHistoryWithImages[0].id, status: output.status }, 'Wardrobe indexing completed');

    const items = output.items ?? [];
    logger.debug({ itemsCount: Array.isArray(items) ? items.length : 0 }, 'Processing wardrobe items');

    for (const item of items) {
      const displayName = `${item.type}`;
      const nameLower = toNameLower(displayName);
      const existing = await prisma.wardrobeItem.findFirst({
        where: {
          userId: state.conversationHistoryWithImages[0].userId,
          nameLower,
          category: item.category
        }
      });
      if (!existing) {
        const colors: string[] = [item.attributes.color_primary, item.attributes.color_secondary].filter(Boolean) as string[];
        await prisma.wardrobeItem.create({
          data: {
            userId: state.conversationHistoryWithImages[0].userId,
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
  } catch (err) {
    logger.error({ err: (err as Error)?.message }, 'Wardrobe indexing failed');
    return {};
  }
}