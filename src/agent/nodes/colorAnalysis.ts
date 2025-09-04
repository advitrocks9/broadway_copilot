import { z } from 'zod';

import prisma from '../../db/client';
import { getVisionLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { Replies } from '../state';
import { numImagesInMessage } from '../../utils/conversation';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

/**
 * Performs color analysis from a portrait and returns a text reply; logs and persists results.
 */
const logger = getLogger('node:color_analysis');

export async function colorAnalysisNode(state: any): Promise<Replies> {

  if (numImagesInMessage(state.conversationHistory) === 0) {
    const responses = [
      "Darling, I can't analyze your texts — only your tones! Step into the spotlight and upload a photo so we can begin your color performance.",
      "No image, no curtain call! Please upload your photo so I can reveal your starring shades.",
      "I can't hit the right note without your photo! Send me an image, and I'll orchestrate your perfect color palette.",
      "Your words are dazzling, but I need visuals for this act! Upload a photo and let's put your true colors center stage.",
      "I can't analyze text messages, only leading looks! Drop a photo so we can get this show on the road.",
      "Every star needs their spotlight — upload your image and I'll cue the color analysis!",
      "Scene one is missing its star… that's you! Upload your photo so I can roll the color analysis."
    ];
    
    const replies: Replies = [{ reply_type: 'text', reply_text: responses[Math.floor(Math.random() * responses.length)] }];
    return replies;
  }

  const LLMOutputSchema = z.object({
    message1_text: z.string(),
    message2_text: z.string().nullable(),
    skin_tone: z.object({ name: z.string(), hex: z.string() }).nullable(),
    eye_color: z.object({ name: z.string(), hex: z.string() }).nullable(),
    hair_color: z.object({ name: z.string(), hex: z.string() }).nullable(),
    undertone: z.enum(['Warm', 'Cool', 'Neutral']).nullable(),
    palette_name: z.string().nullable(),
    palette_comment: z.string().nullable(),
    top3_colors: z.array(z.object({ name: z.string(), hex: z.string() })),
    avoid3_colors: z.array(z.object({ name: z.string(), hex: z.string() })),
  });

  try {
    const systemPrompt = await loadPrompt('color_analysis.txt');
    const llm = getVisionLLM();


  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("history"),
  ]);

  let history = state.conversationHistory

  const formattedPrompt = await promptTemplate.invoke({ history });
    const output = await llm.withStructuredOutput(LLMOutputSchema).invoke(formattedPrompt.toChatMessages()) as z.infer<typeof LLMOutputSchema>;

    logger.info(output, 'Color analysis output');

    await prisma.colorAnalysis.create({
      data: {
        messageId: state.conversationHistory[0].id,
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
      where: { id: state.conversationHistory[0].userId },
      data: { lastColorAnalysisAt: new Date() }
    });

    const replies: Replies = [{ reply_type: 'text', reply_text: output.message1_text }];
    if (output.message2_text) replies.push({ reply_type: 'text', reply_text: output.message2_text });

    return replies;
  } catch (err) {
    logger.error({ err }, 'Error in color analysis');
    return [{ reply_type: 'text', reply_text: 'Sorry, an error occurred during color analysis. Please try again.' }];
  }
}
