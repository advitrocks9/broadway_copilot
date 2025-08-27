import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { getLogger } from '../../utils/logger';

/**
 * Suggests complementary pairing tags; outputs text reply_type.
 */
const logger = getLogger('node:handle_pairing');

export async function handlePairingNode(state: { input: RunInput; messages?: unknown[]; wardrobe?: unknown; latestColorAnalysis?: unknown }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const question = input.text || 'How to pair items?';
  const systemPrompt = await loadPrompt('handle_pairing.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `UserGender: ${input.gender ?? 'unknown'} (choose examples and fits appropriate to gender).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    { role: 'user', content: `WardrobeContext: ${JSON.stringify(state.wardrobe || {})}` },
    { role: 'user', content: `LatestColorAnalysis: ${JSON.stringify(state.latestColorAnalysis || null)}` },
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: question },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  logger.info({ userText: question }, 'HandlePairing: input');
  console.log('🤖 HandlePairing Model Input:', JSON.stringify(prompt, null, 2));
  const resp = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as { reply_text: string; followup_text: string | null };
  logger.info(resp, 'HandlePairing: output');
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
