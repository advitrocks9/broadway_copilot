import { z } from 'zod';

import { RunInput } from '../state';
import { Reply } from '../../types/common';
import { getNanoLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';

/**
 * Asks the user for required profile fields and returns a text reply.
 */
const logger = getLogger('node:ask_user_info');

interface AskUserInfoState {
  input: RunInput;
  messages?: unknown[];
  missingProfileFields?: Array<'gender'>;
}

interface AskUserInfoResult {
  replies: Reply[];
}

export async function askUserInfoNode(state: AskUserInfoState): Promise<AskUserInfoResult>{
  const llm = getNanoLLM();
  const { input } = state;
  const missing: Array<'gender'> = state.missingProfileFields || [];
  const convo = (state.messages as unknown[]) || [];

  const system = await loadPrompt('ask_user_info.txt');
  const list = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const promptMessages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: `ConversationContext: ${JSON.stringify(convo)}` },
    { role: 'user', content: `Missing Fields: ${JSON.stringify({ fields: list })}` },
  ];
  const AskSchema = z.object({ text: z.string() });
  logger.info({ userId: input.userId, missing }, 'AskUserInfo: input');
  logger.debug({ promptMessages }, 'AskUserInfo: model input');
  const response = await llm.withStructuredOutput(AskSchema as any).invoke(promptMessages) as { text: string };
  logger.info(response, 'AskUserInfo: output');
  const replyText = response.text;
  const replies: Reply[] = [{ reply_type: 'text', reply_text: replyText }];
  return { replies };
}