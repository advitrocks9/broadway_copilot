import { z } from 'zod';
import { logger } from '../../utils/logger';

import { getTextLLM, getVisionLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { prisma } from '../../lib/prisma';
import { queueWardrobeIndex } from '../../lib/tasks';
import { numImagesInMessage } from '../../utils/context';
import { loadPrompt } from '../../utils/prompts';
import type { QuickReplyButton } from '../../lib/twilio/types';

import { PendingType, Prisma } from '@prisma/client';
import { InternalServerError } from '../../utils/errors';
import { GraphState, Replies } from '../state';

const ScoringCategorySchema = z.object({
  score: z.number().min(0).max(10).describe('Score as a fractional number between 0 and 10.'),
  explanation: z.string().describe('A short explanation for this score.'),
});

const LLMOutputSchema = z.object({
  comment: z.string().describe("Overall comment or reason summarizing the outfit's vibe."),
  fit_silhouette: ScoringCategorySchema.describe("Assessment of fit & silhouette."),
  color_harmony: ScoringCategorySchema.describe("Assessment of color coordination."),
  styling_details: ScoringCategorySchema.describe("Assessment of accessories, layers, and details."),
  context_confidence: ScoringCategorySchema.describe("How confident the outfit fits the occasion."),
  overall_score: z.number().min(0).max(10).describe("Overall fractional score for the outfit."),
  recommendations: z.array(z.string()).describe("Actionable style suggestions."),
  prompt: z.string().describe("The original input prompt or context."),
});

const NoImageLLMOutputSchema = z.object({
  reply_text: z.string().describe('The text to send to the user explaining they need to send an image.'),
});

const tonalityButtons: QuickReplyButton[] = [
  { text: ' Friendly', id: 'friendly' },
  { text: ' Savage', id: 'savage' },
  { text: ' Hype BFF', id: 'hype_bff' },
];

export async function vibeCheck(state: GraphState): Promise<GraphState> {
  logger.debug({
    userId: state.user.id,
    pending: state.pending,
    selectedTonality: state.selectedTonality,
    intent: state.intent,
  }, 'Entering vibeCheck node with state');

  const userId = state.user.id;

  try {
    // If user hasn't chosen tonality yet, prompt for it
    if (!state.selectedTonality) {
      const replies: Replies = [{
        reply_type: 'quick_reply',
        reply_text: 'Choose a tonality for your vibe check:',
        buttons: tonalityButtons,
      }];
      return {
        ...state,
        assistantReply: replies,
        pending: PendingType.TONALITY_SELECTION, // Add this to your PendingType enum
      };
    }

    const imageCount = numImagesInMessage(state.conversationHistoryWithImages);

    if (imageCount === 0) {
      const systemPromptText = await loadPrompt('handlers/analysis/no_image_request.txt');
      const systemPrompt = new SystemMessage(
        systemPromptText.replace('{analysis_type}', 'vibe check'),
      );
      const response = await getTextLLM()
        .withStructuredOutput(NoImageLLMOutputSchema)
        .run(systemPrompt, state.conversationHistoryTextOnly, state.traceBuffer, 'vibeCheck');
      const replies: Replies = [{ reply_type: 'text', reply_text: response.reply_text }];
      return {
        ...state,
        assistantReply: replies,
        pending: PendingType.VIBE_CHECK_IMAGE,
      };
    }

    // With tonality and image, proceed with vibe check evaluation
    const systemPromptText = await loadPrompt('handlers/analysis/vibe_check.txt');
    const systemPrompt = new SystemMessage(systemPromptText);

    const result = await getVisionLLM()
      .withStructuredOutput(LLMOutputSchema)
      .run(systemPrompt, state.conversationHistoryWithImages, state.traceBuffer, 'vibeCheck');

    const latestMessage = state.conversationHistoryWithImages.at(-1);
    if (!latestMessage || !latestMessage.meta?.messageId) {
      throw new InternalServerError('Could not find latest message ID for vibe check');
    }
    const latestMessageId = latestMessage.meta.messageId as string;

    const vibeCheckData: Prisma.VibeCheckUncheckedCreateInput = {
      userId,
      comment: result.comment,
      fit_silhouette_score: result.fit_silhouette.score,
      fit_silhouette_explanation: result.fit_silhouette.explanation,
      color_harmony_score: result.color_harmony.score,
      color_harmony_explanation: result.color_harmony.explanation,
      styling_details_score: result.styling_details.score,
      styling_details_explanation: result.styling_details.explanation,
      context_confidence_score: result.context_confidence.score,
      context_confidence_explanation: result.context_confidence.explanation,
      overall_score: result.overall_score,
      recommendations: result.recommendations,
      prompt: result.prompt,
      tonality: state.selectedTonality, // save the selected tonality
    };

    const [, user] = await prisma.$transaction([
      prisma.vibeCheck.create({ data: vibeCheckData }),
      prisma.user.update({
        where: { id: userId },
        data: { lastVibeCheckAt: new Date() },
      }),
    ]);

    queueWardrobeIndex(userId, latestMessageId);

    const replies: Replies = [
      {
        reply_type: 'text',
        reply_text: `
✨ *Vibe Check Results* ✨

${result.comment}

👕 *Fit & Silhouette*: ${result.fit_silhouette.score}/10  
_${result.fit_silhouette.explanation}_

🎨 *Color Harmony*: ${result.color_harmony.score}/10  
_${result.color_harmony.explanation}_

🧢 *Styling Details*: ${result.styling_details.score}/10  
_${result.styling_details.explanation}_

🎯 *Context Confidence*: ${result.context_confidence.score}/10  
_${result.context_confidence.explanation}_

⭐ *Overall Score*: *${result.overall_score.toFixed(1)}/10*

💡 *Recommendations*:  
${result.recommendations.map((rec, i) => `   ${i + 1}. ${rec}`).join('\n')}
        `.trim(),
      },
    ];

    return {
      ...state,
      user,
      assistantReply: replies,
      pending: PendingType.NONE,
    };
  } catch (err: unknown) {
    throw new InternalServerError('Vibe check failed', { cause: err });
  }
}
