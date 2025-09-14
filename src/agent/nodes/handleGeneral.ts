import { z } from 'zod';

import { agentExecutor } from '../../lib/ai/agents/executor';
import { getTextLLM } from '../../lib/ai';
import { SystemMessage } from '../../lib/ai/core/messages';
import { InternalServerError } from '../../utils/errors';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { fetchRelevantMemories } from '../tools';
import { Replies } from '../state';
import { GraphState } from '../state';

const SimpleOutputSchema = z.object({
  reply_text: z.string().describe('The text response to the user.'),
});

const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The first text message response to the user.'),
  message2_text: z.string().describe('The second text message response to the user.').nullable(),
});

/**
 * Handles general conversation intents such as greeting, menu, or open chat.
 * @param state Agent state containing user, conversation history, and routing info.
 */
export async function handleGeneralNode(state: GraphState): Promise<GraphState> {
  const { user, conversationHistoryTextOnly, generalIntent, input } = state;
  const userId = user.id;
  const messageId = input.MessageSid;

  try {
    if (generalIntent === 'greeting' || generalIntent === 'menu') {
      let systemPromptText = await loadPrompt(`handlers/general/handle_${generalIntent}.txt`);
      if (generalIntent === 'greeting') {
        systemPromptText = systemPromptText.replace('{profileName}', user.profileName);
      }
      const systemPrompt = new SystemMessage(systemPromptText);
      const response = await getTextLLM()
        .withStructuredOutput(SimpleOutputSchema)
        .run(
          systemPrompt,
          conversationHistoryTextOnly,
          state.graphRunId,
          'handleGeneral',
        );

      const availableActions = [
        { text: 'Vibe check', id: 'vibe_check' },
        { text: 'Color analysis', id: 'color_analysis' },
        { text: 'Styling', id: 'styling' },
      ];

      const replies: Replies = [];
      if (generalIntent === 'greeting') {
        replies.push({ reply_type: 'image', media_url: WELCOME_IMAGE_URL });
      }
      replies.push({
        reply_type: 'quick_reply',
        reply_text: response.reply_text,
        buttons: availableActions,
      });

      logger.debug({ userId, messageId }, `${generalIntent} handled`);
      return { ...state, assistantReply: replies };
    }

    if (generalIntent === 'chat') {
      const tools = [fetchRelevantMemories(userId)];
      const systemPromptText = await loadPrompt('handlers/general/handle_chat.txt');
      const systemPrompt = new SystemMessage(systemPromptText);

      const finalResponse = await agentExecutor(
        getTextLLM(),
        systemPrompt,
        conversationHistoryTextOnly,
        { tools, outputSchema: LLMOutputSchema, nodeName: 'handleGeneral' },
        state.graphRunId,
      );

      const replies: Replies = [
        { reply_type: 'text', reply_text: finalResponse.message1_text },
      ];
      if (finalResponse.message2_text) {
        replies.push({ reply_type: 'text', reply_text: finalResponse.message2_text });
      }

      logger.debug({ userId, messageId }, 'Chat handled');
      return { ...state, assistantReply: replies };
    }

    throw new InternalServerError(`Unhandled general intent: ${generalIntent}`);
  } catch (err: unknown) {
    throw new InternalServerError('Failed to handle general intent', { cause: err });
  }
}
