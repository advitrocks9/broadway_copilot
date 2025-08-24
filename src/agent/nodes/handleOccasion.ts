import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { getLogger } from '../../utils/logger';

/**
 * Crafts occasion-specific suggestions; outputs text reply_type.
 */
const logger = getLogger('node:handle_occasion');

export async function handleOccasionNode(state: { input: RunInput; intent?: string; messages?: unknown[]; wardrobe?: unknown; latestColorAnalysis?: unknown }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const intent: string | undefined = state.intent;
  const systemPrompt = await loadPrompt('handle_occasion.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `UserGender: ${input.gender ?? 'unknown'} (use this to tailor occasion-specific recommendations).` },
    { role: 'system', content: `Current user ID: ${input.userId}` },
    { role: 'system', content: `Intent: ${intent || 'occasion'}` },
    { role: 'system', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    { role: 'system', content: `WardrobeContext: ${JSON.stringify(state.wardrobe || {})}` },
    { role: 'system', content: `LatestColorAnalysis: ${JSON.stringify(state.latestColorAnalysis || null)}` },
    { role: 'system', content: `LastColorAnalysisAtISO: ${activity.lastColorAnalysisAt ? activity.lastColorAnalysisAt.toISOString() : 'none'}` },
    { role: 'system', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'system', content: `LastVibeCheckAtISO: ${activity.lastVibeCheckAt ? activity.lastVibeCheckAt.toISOString() : 'none'}` },
    { role: 'system', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: input.text || 'Suggest an outfit for my occasion.' },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  logger.info({ userText: input.text || '' }, 'HandleOccasion: input');
  const resp = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as { reply_text: string; followup_text: string | null };
  logger.info(resp, 'HandleOccasion: output');
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
