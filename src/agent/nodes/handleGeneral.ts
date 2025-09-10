import { z } from 'zod';

import { invokeAgent, invokeTextLLMWithJsonOutput } from '../../lib/llm';
import { createError } from '../../utils/errors';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { fetchRelevantMemories } from '../tools';
import { Replies } from '../state';

const SimpleOutputSchema = z.object({
  reply_text: z.string().describe('The text response to the user.'),
});

const ChatOutputSchema = z.object({
  message1_text: z.string().describe('The primary text response to the user.'),
  message2_text: z
    .string()
    .nullable()
    .describe(
      'An optional second message to provide more details or continue the conversation.'
    ),
});

/**
 * Handles general conversation intents such as greeting, menu, or open chat.
 * @param state Agent state containing user, conversation history, and routing info.
 */
export async function handleGeneralNode(state: any) {
  const { user, conversationHistoryTextOnly, generalIntent, input } = state;
  const userId = user?.id;
  const messageId = input?.MessageSid;

  try {
    if (generalIntent === 'greeting' || generalIntent === 'menu') {
      const systemPrompt = await loadPrompt(`handle_${generalIntent}.txt`, {
        injectPersona: true,
      });
      const response = await invokeTextLLMWithJsonOutput(systemPrompt, SimpleOutputSchema);

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

      logger.info({ userId, messageId }, `${generalIntent} handled`);
      return { assistantReply: replies };
    }

    if (generalIntent === 'chat') {
      const tools = [fetchRelevantMemories(userId)];
      const systemPrompt = await loadPrompt('handle_chat.txt', { injectPersona: true });

      const finalResponse = await invokeAgent(
        tools,
        systemPrompt,
        conversationHistoryTextOnly,
        ChatOutputSchema,
      );

      const replies: Replies = [{ reply_type: 'text', reply_text: finalResponse.message1_text }];
      if (finalResponse.message2_text) {
        replies.push({ reply_type: 'text', reply_text: finalResponse.message2_text });
      }

      logger.info({ userId, messageId }, 'Chat handled');
      return { assistantReply: replies };
    }

    throw createError.internalServerError(`Unhandled general intent: ${generalIntent}`);
  } catch (err: any) {
    logger.error({ userId, messageId, err: err.message, stack: err.stack }, 'Error in handleGeneralNode');
    if (err.statusCode) throw err;

    const replies: Replies = [
      {
        reply_type: 'text',
        reply_text: "I'm not sure how to help with that. Could you try asking in a different way?",
      },
    ];
    return { assistantReply: replies };
  }
}
