import { z } from 'zod';

import { AdditionalContextItem, RunInput } from '../state';
import { Reply } from '../../types/common';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { buildAdditionalContextSections } from '../../utils/context';

/**
 * Provides vacation-specific guidance; outputs text reply_type.
 */
const logger = getLogger('node:handle_vacation');

interface HandleVacationState {
  input: RunInput;
  messages?: unknown[];
  wardrobe?: unknown;
  latestColorAnalysis?: unknown;
  additionalContext?: AdditionalContextItem[];
}

interface HandleVacationResult {
  replies: Reply[];
}

export async function handleVacationNode(state: HandleVacationState): Promise<HandleVacationResult>{
  const { input } = state;
  const systemPrompt = await loadPrompt('handle_vacation.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `UserGender: ${input.gender ?? 'unknown'} (tailor vacation packing and style to gender).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    ...buildAdditionalContextSections(state),
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: input.text || 'I need vacation outfit ideas.' },
  ];
  const Schema = z.object({
    reply_text: z.string(),
    followup_text: z.string().nullable()
  });

  logger.info({ userText: input.text || '' }, 'HandleVacation: input');
  logger.debug({ prompt }, 'HandleVacation: model input');
  const response = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as {
    reply_text: string;
    followup_text: string | null;
  };
  logger.info(response, 'HandleVacation: output');

  const replies: Reply[] = [{ reply_type: 'text', reply_text: response.reply_text }];
  if (response.followup_text) {
    replies.push({ reply_type: 'text', reply_text: response.followup_text });
  }
  return { replies };
}
