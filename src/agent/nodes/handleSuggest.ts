import { AdditionalContextItem, RunInput } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import {
  buildCompletePrompt,
  processResponseWithFollowup,
  TextWithFollowupSchema,
  Reply,
} from '../../utils/handlerUtils';

/**
 * Suggests actionable style improvements; outputs text reply_type.
 */
const logger = getLogger('node:handle_suggest');

interface HandleSuggestState {
  input: RunInput;
  messages?: unknown[];
  wardrobe?: unknown;
  latestColorAnalysis?: unknown;
  additionalContext?: AdditionalContextItem[];
}

interface HandleSuggestResult {
  replies: Reply[];
}

export async function handleSuggestNode(state: HandleSuggestState): Promise<HandleSuggestResult> {
  const { input } = state;
  const question = input.text || 'Suggestions to improve the outfit?';
  const systemPrompt = await loadPrompt('handle_suggest.txt');
  const activity = await queryActivityTimestamps(input.userId);

  const prompt = buildCompletePrompt(
    systemPrompt,
    input.gender,
    state.messages,
    state,
    activity,
    question
  );

  logger.info({ userText: question }, 'HandleSuggest: input');
  logger.debug({ prompt }, 'HandleSuggest: model input');

  const llm = getNanoLLM();
  const response = await (llm as any)
    .withStructuredOutput(TextWithFollowupSchema)
    .invoke(prompt) as {
      reply_text: string;
      followup_text: string | null;
    };

  logger.info(response, 'HandleSuggest: output');

  const replies = processResponseWithFollowup(response, 'text');
  return { replies };
}
