import { RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { getLogger } from '../../utils/logger';

/**
 * Provides vacation-specific guidance; outputs text reply_type.
 */
const logger = getLogger('node:handle_vacation');

export async function handleVacationNode(state: { input: RunInput; messages?: unknown[]; wardrobe?: unknown; latestColorAnalysis?: unknown }): Promise<{ replies: Array<{ reply_type: 'text'; reply_text: string }> }>{
  const { input } = state;
  const systemPrompt = await loadPrompt('handle_vacation.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const prompt: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `UserGender: ${input.gender ?? 'unknown'} (tailor vacation packing and style to gender).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
    { role: 'user', content: `WardrobeContext: ${JSON.stringify(state.wardrobe || {})}` },
    { role: 'user', content: `LatestColorAnalysis: ${JSON.stringify(state.latestColorAnalysis || null)}` },
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: input.text || 'I need vacation outfit ideas.' },
  ];
  const Schema = z.object({ reply_text: z.string(), followup_text: z.string().nullable() });
  logger.info({ userText: input.text || '' }, 'HandleVacation: input');
  console.log('🤖 HandleVacation Model Input:', JSON.stringify(prompt, null, 2));
  const resp = await getNanoLLM().withStructuredOutput(Schema as any).invoke(prompt as any) as { reply_text: string; followup_text: string | null };
  logger.info(resp, 'HandleVacation: output');
  const replies: Array<{ reply_type: 'text'; reply_text: string }> = [{ reply_type: 'text', reply_text: resp.reply_text }];
  if (resp.followup_text) replies.push({ reply_type: 'text', reply_text: resp.followup_text });
  return { replies };
}
