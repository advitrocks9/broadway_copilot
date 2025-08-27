import { AdditionalContextItem, RunInput } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import {
  buildCompletePrompt,
  processResponseWithFollowup,
  StructuredReplySchema,
  Reply,
} from '../../utils/handlerUtils';

/**
 * Handles general chat; may return text, menu, or card per prompt schema.
 */
const logger = getLogger('node:handle_general');

interface HandleGeneralState {
  input: RunInput;
  messages?: unknown[];
  wardrobe?: unknown;
  latestColorAnalysis?: unknown;
  additionalContext?: AdditionalContextItem[];
}

interface HandleGeneralResult {
  replies: Reply[];
}

export async function handleGeneralNode(state: HandleGeneralState): Promise<HandleGeneralResult> {
  const { input } = state;
  const systemPrompt = await loadPrompt('handle_general.txt');
  const activity = await queryActivityTimestamps(input.userId);
  const userQuestion = input.text || 'Help with style.';

  const prompt = buildCompletePrompt(
    systemPrompt,
    input.gender,
    state.messages,
    state,
    activity,
    userQuestion
  );

  logger.info({ userText: userQuestion }, 'HandleGeneral: input');
  logger.debug({ prompt }, 'HandleGeneral: model input');

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(StructuredReplySchema)
    .invoke(prompt) as {
      reply_type: 'text' | 'menu' | 'card';
      reply_text: string;
      followup_text: string | null;
    };

  logger.info(response, 'HandleGeneral: output');

  const replies = processResponseWithFollowup(response);
  return { replies };
}
