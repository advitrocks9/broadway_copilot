import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { prisma } from '../../lib/prisma';
import { getVisionLLM, getTextLLM } from '../../lib/llm';
import { numImagesInMessage } from '../../utils/conversation';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { createError } from '../../utils/errors';

import { Replies } from '../state';

/**
 * Schema for a color object with name and hex code.
 */
const ColorObjectSchema = z.object({
  name: z.string().describe("A concise, shopper-friendly color name (e.g., 'Warm Ivory', 'Deep Espresso')."),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("The representative hex color code (#RRGGBB)."),
});

/**
 * Schema for the LLM output in color analysis.
 */
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

type ColorAnalysisOutput = z.infer<typeof LLMOutputSchema>;

/**
 * Handles the case where no image is provided, generating a default text response.
 * @param state - The current state of the agent.
 * @returns Updated state with assistant reply.
 */
async function handleNoImageCase(state: any) {
  const defaultPrompt = await loadPrompt('color_analysis_no_image.txt', { injectPersona: true });
  const llm = getTextLLM();
  const response = await llm.invoke(defaultPrompt);
  const reply_text = response.content as string;
  logger.debug({ userId: state.user?.id, reply_text }, 'Invoking text LLM for no-image response');
  const replies: Replies = [{ reply_type: 'text', reply_text }];
  return { ...state, assistantReply: replies };
}

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 * @param state The current agent state.
 */
export async function colorAnalysisNode(state: any) {
  const userId = state.user?.id;
  const messageId = state.input?.MessageSid;

  const imageCount = numImagesInMessage(state.conversationHistoryWithImages);

  if (imageCount === 0) {
    return handleNoImageCase(state);
  }

  try {
    const systemPrompt = await loadPrompt('color_analysis.txt', { injectPersona: true });
    const llm = getVisionLLM();

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    const history = state.conversationHistoryWithImages;

    const formattedPrompt = await promptTemplate.invoke({ history });
    const output = (await (llm as any).withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages())) as ColorAnalysisOutput;

    await prisma.colorAnalysis.create({
      data: {
        userId,
        skin_tone: output.skin_tone?.name ?? null,
        eye_color: output.eye_color?.name ?? null,
        hair_color: output.hair_color?.name ?? null,
        undertone: output.undertone ?? null,
        palette_name: output.palette_name ?? null,
        top3_colors: output.top3_colors,
        avoid3_colors: output.avoid3_colors,
      },
    });

    await prisma.user.update({
      where: { id: state.user.id },
      data: { lastColorAnalysisAt: new Date() },
    });

    const replies: Replies = [{ reply_type: 'text', reply_text: output.message1_text }];
    if (output.message2_text) {
      replies.push({ reply_type: 'text', reply_text: output.message2_text });
    }

    logger.info({ userId, messageId, replies }, 'Color analysis completed successfully');
    return { ...state, assistantReply: replies };
  } catch (err: any) {
    throw createError.internalServerError('Color analysis failed', { cause: err });
  }
}
