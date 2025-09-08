import { z } from 'zod';

import prisma from '../../lib/prisma';
import { getVisionLLM, getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 */
const logger = getLogger('node:color_analysis');

const ColorObjectSchema = z.object({
  name: z.string().describe("A concise, shopper-friendly color name (e.g., 'Warm Ivory', 'Deep Espresso')."),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("The representative hex color code (#RRGGBB)."),
});

const LLMOutputSchema = z.object({
  message1_text: z.string().describe("The primary analysis result message to be sent to the user."),
  message2_text: z.string().nullable().describe("An optional, short follow-up message to suggest next steps (e.g., 'Want me to suggest outfits using your palette colors?')."),
  skin_tone: ColorObjectSchema.nullable().describe("The user's skin tone, including a friendly name and a representative hex code."),
  eye_color: ColorObjectSchema.nullable().describe("The user's eye color, including a friendly name and a representative hex code."),
  hair_color: ColorObjectSchema.nullable().describe("The user's hair color, including a friendly name and a representative hex code."),
  undertone: z.enum(['Warm', 'Cool', 'Neutral']).nullable().describe("The user's skin undertone."),
  palette_name: z.string().nullable().describe("The name of the 12-season color palette that best fits the user."),
  palette_comment: z.string().nullable().describe("A short, helpful comment on how to style within the assigned palette."),
  top3_colors: z.array(ColorObjectSchema).describe("An array of the top 3 most flattering colors for the user."),
  avoid3_colors: z.array(ColorObjectSchema).describe("An array of 3 colors the user might want to avoid."),
});

export async function colorAnalysisNode(state: any) {

  if (numImagesInMessage(state.conversationHistoryWithImages) === 0) {
    const defaultPrompt = await loadPrompt('color_analysis_no_image.txt', { injectPersona: true });
    const llm = getTextLLM();
    const response = await llm.invoke(defaultPrompt);
    const reply_text = response.content as string;
    const replies: Replies = [{ reply_type: 'text', reply_text: reply_text }];
    return { assistantReply: replies };
  }

  try {
    const systemPrompt = await loadPrompt('color_analysis.txt', { injectPersona: true });
    const llm = getVisionLLM();

    const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  let history = state.conversationHistoryWithImages

  const formattedPrompt = await promptTemplate.invoke({ history });
    const output = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

    logger.debug({ messageId: state.conversationHistoryWithImages[0].id, palette: output.palette_name }, 'Color analysis completed');

    await prisma.colorAnalysis.create({
      data: {
        messageId: state.conversationHistoryWithImages[0].id,
        skin_tone: output.skin_tone?.name ?? null,
        eye_color: output.eye_color?.name ?? null,
        hair_color: output.hair_color?.name ?? null,
        undertone: output.undertone ?? null,
        palette_name: output.palette_name ?? null,
        top3_colors: output.top3_colors,
        avoid3_colors: output.avoid3_colors
      }
    });

    await prisma.user.update({
      where: { id: state.conversationHistoryWithImages[0].userId },
      data: { lastColorAnalysisAt: new Date() }
    });

    const replies: Replies = [{ reply_type: 'text', reply_text: output.message1_text }];
    if (output.message2_text) replies.push({ reply_type: 'text', reply_text: output.message2_text });

    return { assistantReply: replies };
  } catch (err) {
    logger.error({ err: (err as Error)?.message }, 'Color analysis failed');
    return { assistantReply: [{ reply_type: 'text', reply_text: 'Sorry, an error occurred during color analysis. Please try again.' }] };
  }
}
