import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { getVisionLLM, getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { queueWardrobeIndex } from '../../lib/tasks';
import { numImagesInMessage } from '../../utils/context';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';

import { Replies } from '../state';
import { GraphState } from '../state';
import { InternalServerError } from '../../utils/errors';
import { PendingType } from '@prisma/client';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
const VibeCategorySchema = z.object({
  heading: z.string().describe("The name of the scoring category (e.g., 'Fit & Silhouette', 'Color Harmony')."),
  score: z.number().min(0).max(10).describe("The score for this category, from 0 to 10."),
});

const LLMOutputSchema = z.object({
  vibe_score: z.number().min(0).max(10).nullable().describe("The overall vibe score from 0 to 10. Null if the image is unsuitable."),
  vibe_reply: z.string().describe("A short, witty, and punchy reply about the outfit's vibe (under 8 words)."),
  categories: z.array(VibeCategorySchema).length(4).describe("An array of exactly 4 scoring categories, each with a heading and a score."),
  message1_text: z.string().describe("The main reply message that is compliment-forward and provides a brief rationale for the score."),
  message2_text: z.string().nullable().describe("An optional, short follow-up question to suggest a next step (e.g., 'Want some tips to elevate this look?')."),
});

const NoImageLLMOutputSchema = z.object({
  reply_text: z.string().describe("The text to send to the user explaining they need to send an image."),
});

export async function vibeCheck(state: GraphState): Promise<GraphState> {
  const userId = state.user.id;
  try {
    const imageCount = numImagesInMessage(state.conversationHistoryWithImages);

    if (imageCount === 0) {
      const systemPromptText = await loadPrompt('handlers/analysis/no_image_request.txt');
      const systemPrompt = new SystemMessage(systemPromptText.replace('{analysis_type}', 'vibe check'));
      const response = await getTextLLM()
        .withStructuredOutput(NoImageLLMOutputSchema)
        .run(
          systemPrompt,
          state.conversationHistoryTextOnly,
          state.traceBuffer,
          'vibeCheck',
        );
      logger.debug({ userId, reply_text: response.reply_text }, 'Invoking text LLM for no-image response');
      const replies: Replies = [{ reply_type: 'text', reply_text: response.reply_text }];
      return { ...state, assistantReply: replies, pending: PendingType.VIBE_CHECK_IMAGE };
    }

    const systemPromptText = await loadPrompt('handlers/analysis/vibe_check.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const result = await getVisionLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(
        systemPrompt,
        state.conversationHistoryWithImages,
        state.traceBuffer,
        'vibeCheck',
      );

    const latestMessage = state.conversationHistoryWithImages.at(-1);
    if (!latestMessage || !latestMessage.meta?.messageId) {
      throw new InternalServerError('Could not find latest message ID for vibe check');
    }
    const latestMessageId = latestMessage.meta.messageId as string;

    // Dynamically map categories based on headings
    const categoryMap: { [key: string]: string } = {
      'Fit & Silhouette': 'fit_silhouette',
      'Color Harmony': 'color_harmony',
      'Styling Details': 'styling_details',
      'Accessories & Texture': 'accessories_texture',
    };

    const vibeCheckData: any = {
      context_confidence: result.vibe_score,
      overall_score: result.vibe_score,
      comment: result.vibe_reply,
    };

    result.categories.forEach(cat => {
      const key = categoryMap[cat.heading];
      if (key) {
        vibeCheckData[key] = cat.score;
      } else {
        logger.warn({ userId, unknownHeading: cat.heading }, 'Unknown category heading in vibe check');
      }
    });

    await prisma.vibeCheck.create({
      data: {
        userId,
        ...vibeCheckData,
      },
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastVibeCheckAt: new Date() },
    });

    if (process.env.NODE_ENV === 'production') {
      await queueWardrobeIndex(userId, latestMessageId);
      logger.debug({ userId }, 'Scheduled wardrobe indexing for message');
    }


    const replies: Replies = [
      { reply_type: 'text', reply_text: result.message1_text },
    ];

    if (result.message2_text) {
      replies.push({ reply_type: 'text', reply_text: result.message2_text });
    }

    logger.debug({ userId, vibeScore: result.vibe_score, replies }, 'Vibe check completed successfully');
    return { ...state, user, assistantReply: replies, pending: PendingType.NONE };
  } catch (err: unknown) {
    throw new InternalServerError('Vibe check failed', { cause: err });
  }
}

