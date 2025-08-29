import { AdditionalContextItem, RunInput } from '../state';
import { getNanoLLM } from '../../services/openaiService';
import { queryActivityTimestamps } from '../tools';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
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
      reply_type: 'text' | 'quick_reply' | 'greeting';
      reply_text: string;
      followup_text: string | null;
    };

  logger.info(response, 'HandleGeneral: output');

  // Handle greeting type specially - send image first, then text
  if (response.reply_type === 'greeting') {
    const replies: Reply[] = [
      {
        reply_type: 'image',
        media_url: WELCOME_IMAGE_URL,
        reply_text: response.reply_text
      }
    ];

    // Add followup text as a separate text reply if present
    if (response.followup_text) {
      replies.push({
        reply_type: 'text',
        reply_text: response.followup_text
      });
    } 

    return { replies };
  }

  // Handle different reply types
  if (response.reply_type === 'text') {
    const replies: Reply[] = [
      {
        reply_type: 'text',
        reply_text: response.reply_text
      }
    ];

    if (response.followup_text) {
      replies.push({
        reply_type: 'text',
        reply_text: response.followup_text
      });
    }

    return { replies };
  }

  if (response.reply_type === 'quick_reply') {
    // For quick_reply, we need buttons - let's create some default ones based on the response
    const replies: Reply[] = [
      {
        reply_type: 'quick_reply',
        reply_text: response.reply_text,
        buttons: [
          { text: 'Yes', id: 'positive_response' },
          { text: 'No', id: 'negative_response' }
        ]
      }
    ];

    if (response.followup_text) {
      replies.push({
        reply_type: 'text',
        reply_text: response.followup_text
      });
    }

    return { replies };
  }

  // Fallback to text for any unhandled types
  const replies: Reply[] = [
    {
      reply_type: 'text',
      reply_text: response.reply_text
    }
  ];

  if (response.followup_text) {
    replies.push({
      reply_type: 'text',
      reply_text: response.followup_text
    });
  }

  return { replies };
}
