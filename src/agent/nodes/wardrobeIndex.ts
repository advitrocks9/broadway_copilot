import prisma from '../../db/client';
import { getVisionLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { WardrobeIndexResponseSchema, WardrobeIndexResponse } from '../../types/contracts';
import { toNameLower } from '../../utils/text';

/**
 * Indexes wardrobe items from an image to persist context for future chats.
 */
const logger = getLogger('node:wardrobe_index');

export async function wardrobeIndexNode(state: any): Promise<void> {

  if (numImagesInMessage(state.conversationHistory) === 0) {
    return;
  }

  const LLMOutputSchema = WardrobeIndexResponseSchema;

  try {
    const systemPrompt = await loadPrompt('wardrobe_index.txt');
    const llm = getVisionLLM();


    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    let history = state.conversationHistory

    const formattedPrompt = await promptTemplate.invoke({ history });
    const output = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as WardrobeIndexResponse;

    logger.info(output, 'WardrobeIndex: output');

    const items = output.items ?? [];
    logger.info({ status: output.status, itemsCount: Array.isArray(items) ? items.length : 0 }, 'WardrobeIndex: processing');


    // Persist wardrobe items to database
    for (const item of items) {
      const displayName = `${item.type}`;
      const nameLower = toNameLower(displayName);
      const existing = await prisma.wardrobeItem.findFirst({
        where: {
          userId: state.conversationHistory[0].userId,
          nameLower,
          category: item.category
        }
      });
      if (!existing) {
        const colors: string[] = [item.attributes.color_primary, item.attributes.color_secondary].filter(Boolean) as string[];
        await prisma.wardrobeItem.create({
          data: {
            userId: state.conversationHistory[0].userId,
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

    return;
  } catch (err) {
    logger.error({ err }, 'Error in wardrobe indexing');
    return;
  }
}


