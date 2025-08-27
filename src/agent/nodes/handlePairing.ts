import { z } from 'zod';

import { AdditionalContextItem, RunInput } from '../state';
import { Reply } from '../../types/common';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { buildAdditionalContextSections } from '../../utils/context';

/**
 * Suggests complementary pairing tags; outputs text reply_type.
 */
const logger = getLogger('node:handle_pairing');

interface HandlePairingState {
  input: RunInput;
  messages?: unknown[];
  wardrobe?: unknown;
  latestColorAnalysis?: unknown;
  additionalContext?: AdditionalContextItem[];
}

interface HandlePairingResult {
  replies: Reply[];
}

export async function handlePairingNode(state: HandlePairingState): Promise<HandlePairingResult>{
  const { input } = state;
  const question = input.text || 'How to pair items?';
  const systemPrompt = await loadPrompt('handle_pairing.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `UserGender: ${input.gender ?? 'unknown'} (choose examples and fits appropriate to gender).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    ...buildAdditionalContextSections(state),
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: question },
  ];
  const Schema = z.object({
    reply_text: z.string(),
    followup_text: z.string().nullable()
  });

  logger.info({ userText: question }, 'HandlePairing: input');
  logger.debug({ prompt }, 'HandlePairing: model input');
  const response = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as {
    reply_text: string;
    followup_text: string | null;
  };
  logger.info(response, 'HandlePairing: output');

  const replies: Reply[] = [{ reply_type: 'text', reply_text: response.reply_text }];
  if (response.followup_text) {
    replies.push({ reply_type: 'text', reply_text: response.followup_text });
  }
  return { replies };
}
