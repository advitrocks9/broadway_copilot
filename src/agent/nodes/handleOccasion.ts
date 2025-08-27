import { z } from 'zod';

import { AdditionalContextItem, RunInput } from '../state';
import { GraphMessages, WardrobeContext, LatestColorAnalysis, Reply } from '../../types/common';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { buildAdditionalContextSections } from '../../utils/context';

/**
 * Crafts occasion-specific suggestions; outputs text reply_type.
 */
const logger = getLogger('node:handle_occasion');

interface HandleOccasionState {
  input: RunInput;
  messages?: GraphMessages;
  wardrobe?: WardrobeContext;
  latestColorAnalysis?: LatestColorAnalysis;
  additionalContext?: AdditionalContextItem[];
}

interface HandleOccasionResult {
  replies: Reply[];
}

export async function handleOccasionNode(state: HandleOccasionState): Promise<HandleOccasionResult>{
  const { input } = state;
  const systemPrompt = await loadPrompt('handle_occasion.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `UserGender: ${input.gender ?? 'unknown'} (use this to tailor occasion-specific recommendations).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    ...buildAdditionalContextSections(state),
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: input.text || 'Suggest an outfit for my occasion.' },
  ];
  const Schema = z.object({
    reply_text: z.string(),
    followup_text: z.string().nullable()
  });

  logger.info({ userText: input.text || '' }, 'HandleOccasion: input');
  logger.debug({ prompt }, 'HandleOccasion: model input');
  const response = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as {
    reply_text: string;
    followup_text: string | null;
  };
  logger.info(response, 'HandleOccasion: output');

  const replies: Reply[] = [{ reply_type: 'text', reply_text: response.reply_text }];
  if (response.followup_text) {
    replies.push({ reply_type: 'text', reply_text: response.followup_text });
  }
  return { replies };
}
