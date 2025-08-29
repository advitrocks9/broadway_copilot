import { z } from 'zod';
import { AdditionalContextItem } from '../agent/state';
import { Reply } from '../types/common';
import { buildAdditionalContextSections } from './context';

// Re-export Reply for backward compatibility
export { Reply };

/**
 * Common utilities for LangGraph handler nodes.
 */

/**
 * Builds common prompt sections used across multiple handlers.
 */
export function buildCommonPromptSections(
  userGender: string | null | undefined,
  conversationContext: unknown[] | undefined,
  activity: { colorAnalysisHoursAgo?: number; vibeCheckHoursAgo?: number },
  userQuestion: string
): Array<{ role: 'user'; content: string }> {
  return [
    { role: 'user', content: `UserGender: ${userGender ?? 'unknown'} (if known, tailor guidance and examples accordingly).` },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(conversationContext || [])}` },
    { role: 'user', content: `LastColorAnalysisHoursAgo: ${activity.colorAnalysisHoursAgo ?? 'unknown'}` },
    { role: 'user', content: `LastVibeCheckHoursAgo: ${activity.vibeCheckHoursAgo ?? 'unknown'}` },
    { role: 'user', content: userQuestion },
  ];
}

/**
 * Builds a complete prompt array with system prompt and common sections.
 */
export function buildCompletePrompt(
  systemPrompt: string,
  userGender: string | null | undefined,
  conversationContext: unknown[] | undefined,
  state: {
    wardrobe?: unknown;
    latestColorAnalysis?: unknown;
    additionalContext?: AdditionalContextItem[];
  },
  activity: { colorAnalysisHoursAgo?: number; vibeCheckHoursAgo?: number },
  userQuestion: string
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    ...buildCommonPromptSections(userGender, conversationContext, activity, userQuestion),
    ...buildAdditionalContextSections(state),
  ];
}

/**
 * Processes LLM response with followup text into reply array.
 */
export function processResponseWithFollowup(
  response: { reply_type?: 'text' | 'quick_reply'; reply_text: string; followup_text?: string | null },
  defaultReplyType: 'text' | 'quick_reply' = 'text'
): Reply[] {
  const replyType = response.reply_type || defaultReplyType;

  const baseReply: Reply = replyType === 'quick_reply'
    ? { reply_type: 'quick_reply', reply_text: response.reply_text, buttons: [] }
    : { reply_type: 'text', reply_text: response.reply_text };

  const replies: Reply[] = [baseReply];

  if (response.followup_text) {
    replies.push({ reply_type: 'text', reply_text: response.followup_text });
  }

  return replies;
}

/**
 * Common schema for handlers that return text with optional followup.
 */
export const TextWithFollowupSchema = z.object({
  reply_text: z.string(),
  followup_text: z.string().nullable(),
});

/**
 * Common schema for handlers that return structured replies with optional followup.
 */
export const StructuredReplySchema = z.object({
  reply_type: z.enum(['text', 'quick_reply', 'greeting']),
  reply_text: z.string(),
  followup_text: z.string().nullable(),
});
