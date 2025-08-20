import { getNanoLLM } from '../../services/openaiService';
import { IntentLabel, RunInput } from '../state';
import { loadPrompt } from '../../utils/prompts';
import { z } from 'zod';

/**
 * Routes the input to the appropriate handler node based on the router prompt.
 */

type RouterOutput = { intent: IntentLabel; gender_required: boolean };

export async function routeIntent(state: { input: RunInput; messages?: unknown[] }): Promise<{ intent: IntentLabel; missingProfileFields: Array<'gender'>; next: string }>{
  const input = state.input;
  const payload = (input.buttonPayload || '').toLowerCase();
  if (payload === 'vibe_check' || payload === 'color_analysis') {
    const intent = payload as IntentLabel;
    const missingProfileFields: Array<'gender'> = [];
    const next = 'check_image';
    console.log('🧭 [ROUTE_INTENT:SKIP_LLM]', { input, intent, next });
    return { intent, missingProfileFields, next };
  }


  const hasImage = Boolean(input.fileId || input.imagePath);
  let lastButton: string | undefined = undefined;
  try {
    const msgs = Array.isArray(state.messages) ? (state.messages as Array<any>) : [];
    const last = msgs.slice().reverse().find((m: any) => m?.role === 'user' && m?.metadata?.buttonPayload);
    lastButton = (last?.metadata?.buttonPayload || '').toString().toLowerCase();
  } catch {}
  if (hasImage && (lastButton === 'vibe_check' || lastButton === 'color_analysis')) {
    const intent = lastButton as IntentLabel;
    const missingProfileFields: Array<'gender'> = [];
    const next = intent; // route directly to service since image is present
    console.log('🧭 [ROUTE_INTENT:IMG+LAST_BTN]', { intent, next });
    return { intent, missingProfileFields, next };
  }

  const systemPrompt = loadPrompt('route_intent.txt');

  const RouterSchema = z.object({
    intent: z.enum(['general', 'occasion', 'vacation', 'pairing', 'suggest', 'vibe_check', 'color_analysis']),
    gender_required: z.boolean(),
  });

  const content: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `InputState: ${JSON.stringify({ input })}` },
    { role: 'system', content: `ConversationContext: ${JSON.stringify(state.messages || [])}` },
  ];

  console.log('🧭 [ROUTE_INTENT:INPUT]', { input });
  const res = await getNanoLLM().withStructuredOutput(RouterSchema as any).invoke(content as any) as RouterOutput;
  console.log('🧭 [ROUTE_INTENT:OUTPUT]', res);

  const { intent, gender_required } = res;
  const hasGender = input.gender === 'male' || input.gender === 'female';
  const missingProfileFields = gender_required && !hasGender ? (['gender'] as Array<'gender'>) : [];

  let next = 'handle_general';
  if (missingProfileFields.length > 0) {
    next = 'ask_user_info';
  } else if (intent === 'occasion') {
    next = 'handle_occasion';
  } else if (intent === 'vacation') {
    next = 'handle_vacation';
  } else if (intent === 'pairing') {
    next = 'handle_pairing';
  } else if (intent === 'suggest') {
    next = 'handle_suggest';
  } else if (intent === 'vibe_check' || intent === 'color_analysis') {
    next = 'check_image';
  }

  return { intent, missingProfileFields, next };
}
