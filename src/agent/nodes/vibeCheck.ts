import { z } from 'zod';

import prisma from '../../lib/prisma';
import { getVisionLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Rates outfit from an image and returns a concise text summary; logs and persists results.
 */
const logger = getLogger('node:vibe_check');

export async function vibeCheckNode(state: any): Promise<Replies> {
  if (numImagesInMessage(state.conversationHistory) === 0) {
    const responses = [
      "Darling, I can't analyze your texts — only your tones! Step into the spotlight and upload a photo so we can begin your color performance.",
      "No image, no curtain call! Please upload your photo so I can analyze your vibe.",
      "I can't hit the right note without your photo! Send me an image, and I'll orchestrate your perfect vibe check.",
      "Your words are dazzling, but I need visuals for this act! Upload a photo and let's put your true vibe center stage.",
      "I can't analyze text messages, only leading looks! Drop a photo so we can get this show on the road.",
      "Every star needs their spotlight — upload your image and I'll cue the vibe check!",
      "Scene one is missing its star… that's you! Upload your photo so I can roll the vibe check."
    ];

    const replies: Replies = [{ reply_type: 'text', reply_text: responses[Math.floor(Math.random() * responses.length)] }];
    return replies;
  }

  const LLMOutputSchema = z.object({
    vibe_score: z.number().nullable(),
    vibe_reply: z.string(),
    categories: z.array(z.object({
      heading: z.string(),
      score: z.number()
    })),
    reply_text: z.string(),
    followup_text: z.string().nullable(),
  });

  try {
    const systemPrompt = await loadPrompt('vibe_check.txt');
    const llm = getVisionLLM();


    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      new MessagesPlaceholder("history"),
    ]);

    let history = state.conversationHistory

    const formattedPrompt = await promptTemplate.invoke({ history });
    const result = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

    logger.info(result, 'VibeCheck: output');

    const categories = Array.isArray(result.categories) ? result.categories : [];
    const byHeading: Record<string, number | undefined> = Object.fromEntries(
      categories.map((c: any) => [c.heading, typeof c.score === 'number' ? c.score : undefined])
    );

    await prisma.vibeCheck.create({
      data: {
        messageId: state.conversationHistory[0].id,
        fit_silhouette: byHeading['Fit & Silhouette'] ?? null,
        color_harmony: byHeading['Color Harmony'] ?? null,
        styling_details: byHeading['Styling Details'] ?? null,
        accessories_texture: null,
        context_confidence: byHeading['Context & Confidence'] ?? null,
        overall_score: typeof result.vibe_score === 'number' ? result.vibe_score : null,
        comment: result.reply_text || result.vibe_reply,
      },
    });

    await prisma.user.update({
      where: { id: state.conversationHistory[0].userId },
      data: { lastVibeCheckAt: new Date() },
    });

    const scoreLines: string[] = [
      'Vibe Check',
      ...categories.map((c) => `- ${c.heading}: ${typeof c.score === 'number' ? c.score : 'N/A'}`),
      `- Overall: ${typeof result.vibe_score === 'number' ? result.vibe_score : 'N/A'}`,
      '',
    ];

    const combinedText = [scoreLines.join('\n'), result.reply_text].filter(Boolean).join('\n\n');
    const replies: Replies = [
      { reply_type: 'text', reply_text: combinedText },
    ];

    if (result.followup_text) {
      replies.push({ reply_type: 'text', reply_text: result.followup_text });
    }

    return replies;
  } catch (err) {
    logger.error({ err }, 'Error in vibe check');
    return [{ reply_type: 'text', reply_text: 'Sorry, an error occurred during vibe check. Please try again.' }];
  }
}

