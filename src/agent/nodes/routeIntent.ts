import { z } from 'zod';

import { AdditionalContextItem, IntentLabel, RunInput } from '../state';
import { GraphMessages } from '../../types/common';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';

/**
 * Routes the input to the appropriate handler node based on the router prompt.
 */
const logger = getLogger('node:route_intent');

/**
 * Zod schema for validating router output from LLM.
 */
const RouterSchema = z.object({
  intent: z.enum(['general', 'occasion', 'vacation', 'pairing', 'suggest', 'vibe_check', 'color_analysis']),
  gender_required: z.boolean(),
  additionalContext: z.array(z.enum(['wardrobeItems', 'latestColorAnalysis'])).default([]),
});

/**
 * Interface for router output with proper typing.
 */
interface RouterOutput {
  intent: IntentLabel;
  gender_required: boolean;
  additionalContext?: AdditionalContextItem[];
}

interface RouteIntentState {
  input: RunInput;
  messages?: GraphMessages;
}

interface RouteIntentResult {
  intent: IntentLabel;
  missingProfileFields: string[];
  next: string;
  additionalContext?: AdditionalContextItem[];
}

/**
 * Extracts the previous user button payload from conversation messages.
 */
function extractPreviousUserButton(messages?: GraphMessages): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  const lastIdx = messages.length - 1;
  const currentIsUser = lastIdx >= 0 && messages[lastIdx]?.role === 'user';

  if (currentIsUser) {
    for (let i = lastIdx - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === 'user') {
        return (message?.metadata?.buttonPayload || '').toString().toLowerCase();
      }
    }
  }

  return undefined;
}

/**
 * Determines the next node based on intent and missing profile fields.
 */
function determineNextNode(intent: IntentLabel, missingProfileFields: string[]): string {
  if (missingProfileFields.length > 0) {
    return 'ask_user_info';
  }

  switch (intent) {
    case 'occasion':
      return 'handle_occasion';
    case 'vacation':
      return 'handle_vacation';
    case 'pairing':
      return 'handle_pairing';
    case 'suggest':
      return 'handle_suggest';
    case 'vibe_check':
    case 'color_analysis':
      return 'check_image';
    default:
      return 'handle_general';
  }
}

export async function routeIntent(state: RouteIntentState): Promise<RouteIntentResult> {
  const { input } = state;
  const payload = (input.buttonPayload || '').toLowerCase();

  // Handle button payloads that skip LLM routing
  if (payload) {
    const buttonRoutes: Record<string, { intent: IntentLabel; next: string }> = {
      'vibe_check': { intent: 'vibe_check', next: 'check_image' },
      'color_analysis': { intent: 'color_analysis', next: 'check_image' },
      'handle_occasion': { intent: 'occasion', next: 'handle_occasion' },
      'handle_suggest': { intent: 'suggest', next: 'handle_suggest' },
      'handle_vacation': { intent: 'vacation', next: 'handle_vacation' },
    };

    const route = buttonRoutes[payload];
    if (route) {
      logger.info({ input, intent: route.intent, next: route.next }, 'RouteIntent: skip LLM due to button payload');
      return { intent: route.intent, missingProfileFields: [], next: route.next };
    }
  }

  const hasImage = Boolean(input.fileId || input.imagePath);
  const prevUserButton = extractPreviousUserButton(state.messages);

  // Handle image with previous button context
  if (hasImage && (prevUserButton === 'vibe_check' || prevUserButton === 'color_analysis')) {
    const intent = prevUserButton as IntentLabel;
    logger.info({ intent, next: intent }, 'RouteIntent: image present and previous user button');
    return { intent, missingProfileFields: [], next: intent };
  }

  // Load routing prompt and get LLM response
  const systemPrompt = await loadPrompt('route_intent.txt');
  const content = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: `InputState: ${JSON.stringify({ input })}` },
    { role: 'user' as const, content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
  ];

  logger.info({ input }, 'RouteIntent: input');
  logger.debug({ content }, 'RouteIntent: model input');

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(RouterSchema)
    .invoke(content) as RouterOutput;

  logger.info(response, 'RouteIntent: output');

  const { intent, gender_required, additionalContext } = response;
  const hasGender = input.gender === 'male' || input.gender === 'female';
  const missingProfileFields = gender_required && !hasGender ? ['gender' as string] : [];

  const next = determineNextNode(intent, missingProfileFields);

  return { intent, missingProfileFields, next, additionalContext };
}
