import { z } from 'zod';

import { prisma } from '../../lib/prisma';
import { getVisionLLM, getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { scheduleWardrobeIndexForMessage } from '../../services/wardrobeService';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
const logger = getLogger('node:vibe_check');

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

export async function vibeCheckNode(state: any) {
  console.log(state.conversationHistoryWithImages)
  if (numImagesInMessage(state.conversationHistoryWithImages) === 0) {
    const defaultPrompt = await loadPrompt('vibe_check_no_image.txt', { injectPersona: true });
    const llm = getTextLLM();
    const response = await llm.invoke(defaultPrompt);
    const reply_text = response.content as string;
    const replies: Replies = [{ reply_type: 'text', reply_text: reply_text }];
    return { assistantReply: replies };
  }

  try {
    const systemPrompt = await loadPrompt('vibe_check.txt', { injectPersona: true });
    const llm = getVisionLLM();

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    let history = state.conversationHistoryWithImages

    const formattedPrompt = await promptTemplate.invoke({ history });
    const result = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

    const latestMessage = state.conversationHistoryWithImages.at(-1);
    const messageId = latestMessage.additional_kwargs.messageId;
    logger.debug({ messageId, score: result.vibe_score }, 'Vibe check completed');

    const categories = Array.isArray(result.categories) ? result.categories : [];
    const byHeading: Record<string, number | undefined> = Object.fromEntries(
      categories.map((c: any) => [c.heading, typeof c.score === 'number' ? c.score : undefined])
    );

    await prisma.vibeCheck.create({
      data: {
        messageId: state.conversationHistoryWithImages[0].id,
        fit_silhouette: byHeading['Fit & Silhouette'] ?? null,
        color_harmony: byHeading['Color Harmony'] ?? null,
        styling_details: byHeading['Styling Details'] ?? null,
        accessories_texture: null,
        context_confidence: byHeading['Context & Confidence'] ?? null,
        overall_score: typeof result.vibe_score === 'number' ? result.vibe_score : null,
        comment: result.message1_text || result.vibe_reply,
      },
    });

    await prisma.user.update({
      where: { id: state.conversationHistoryWithImages[0].userId },
      data: { lastVibeCheckAt: new Date() },
    });
    await scheduleWardrobeIndexForMessage(messageId);

    const scoreLines: string[] = [
      'Vibe Check',
      ...categories.map((c) => `- ${c.heading}: ${typeof c.score === 'number' ? c.score : 'N/A'}`),
      `- Overall: ${typeof result.vibe_score === 'number' ? result.vibe_score : 'N/A'}`,
      '',
    ];

    const combinedText = [scoreLines.join('\n'), result.message1_text].filter(Boolean).join('\n\n');
    const replies: Replies = [
      { reply_type: 'text', reply_text: combinedText },
    ];

    if (result.message2_text) {
      replies.push({ reply_type: 'text', reply_text: result.message2_text });
    }

    return { assistantReply: replies };
  } catch (err) {
    logger.error({ err: (err as Error)?.message }, 'Vibe check failed');
    return { assistantReply: [{ reply_type: 'text', reply_text: 'Sorry, an error occurred during vibe check. Please try again.' }] };
  }
}

