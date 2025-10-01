import { z } from 'zod';
import { getTextLLM } from '../../lib/ai';
import { agentExecutor } from '../../lib/ai/agents/executor';
import { SystemMessage } from '../../lib/ai/core/messages';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
import { InternalServerError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState, Replies } from '../state';
import { fetchRelevantMemories } from '../tools';

// Define the output schema for chat responses locally
const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The first text message response to the user.'),
  message2_text: z.string().nullable().describe('The second text message response to the user.'),
});

export async function handleGeneral(state: GraphState): Promise<GraphState> {
  const { user, generalIntent, input, conversationHistoryTextOnly, traceBuffer } = state;
  const userId = user.id;
  const messageId = input.MessageSid;

  try {
    if (generalIntent === 'greeting') {
      const greetingText = `Welcome, ${user.profileName}! How can we assist you today?`;
      const buttons = [
        { text: 'Vibe check', id: 'vibe_check' },
        { text: 'Color analysis', id: 'color_analysis' },
        { text: 'Styling', id: 'styling' },
      ];
      const replies: Replies = [
        { reply_type: 'image', media_url: WELCOME_IMAGE_URL },
        { reply_type: 'quick_reply', reply_text: greetingText, buttons },
      ];
      logger.debug({ userId, messageId }, 'Greeting handled with static response');
      return { ...state, assistantReply: replies };
    }

    if (generalIntent === 'menu') {
      const menuText = 'Please choose one of the following options:';
      const buttons = [
        { text: 'Vibe check', id: 'vibe_check' },
        { text: 'Color analysis', id: 'color_analysis' },
        { text: 'Styling', id: 'styling' },
      ];
      const replies: Replies = [{ reply_type: 'quick_reply', reply_text: menuText, buttons }];
      logger.debug({ userId, messageId }, 'Menu handled with static response');
      return { ...state, assistantReply: replies };
    }

    if (generalIntent === 'tonality') {
      const tonalityText = 'Choose your vibe! ✨💬';
      const buttons = [
        { text: 'Hype BFF 🔥', id: 'hype_bff' },
        { text: 'Friendly 🙂', id: 'friendly' },
        { text: 'Savage 😈', id: 'savage' },
      ];
      const replies: Replies = [{ reply_type: 'quick_reply', reply_text: tonalityText, buttons }];
      logger.debug({ userId, messageId }, 'Tonality handled with static response');
      return { ...state, assistantReply: replies };
    }

    if (generalIntent === 'chat') {
      // Inline chat handling logic
      const tools = [fetchRelevantMemories(userId)];
      const systemPromptText = await loadPrompt('handlers/general/handle_chat.txt');
      const systemPrompt = new SystemMessage(systemPromptText);

      const finalResponse = await agentExecutor(
        getTextLLM(),
        systemPrompt,
        conversationHistoryTextOnly,
        { tools, outputSchema: LLMOutputSchema, nodeName: 'handleGeneral' },
        traceBuffer,
      );

      const replies: Replies = [{ reply_type: 'text', reply_text: finalResponse.message1_text }];
      if (finalResponse.message2_text) {
        replies.push({ reply_type: 'text', reply_text: finalResponse.message2_text });
      }

      logger.debug({ userId, messageId }, 'Chat handled');
      return { ...state, assistantReply: replies };
    }

    throw new InternalServerError(`Unhandled general intent: ${generalIntent}`);
  } catch (err: unknown) {
    throw new InternalServerError('Failed to handle general intent', {
      cause: err,
    });
  }
}
