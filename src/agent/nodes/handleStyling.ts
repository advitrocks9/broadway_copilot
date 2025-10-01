import { z } from 'zod';

import { getTextLLM } from '../../lib/ai';
import { agentExecutor } from '../../lib/ai/agents/executor';
import { SystemMessage } from '../../lib/ai/core/messages';
import { InternalServerError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { loadPrompt } from '../../utils/prompts';
import { GraphState, Replies } from '../state';
import { fetchColorAnalysis, searchWardrobe } from '../tools';

const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The main outfit suggestion.'),
  message2_text: z
    .string()
    .nullable()
    .describe('An optional, short follow-up message to ask a question or suggest the next step.'),
});

export async function handleStyling(state: GraphState): Promise<GraphState> {
  const { user, stylingIntent, conversationHistoryTextOnly } = state;
  const userId = user.id;
  const lastMessage = conversationHistoryTextOnly.at(-1);

  if (!stylingIntent) {
    throw new InternalServerError('handleStylingNode called without a styling intent.');
  }

  try {
    if (lastMessage?.meta?.buttonPayload) {
      const defaultPromptText = await loadPrompt('handlers/styling/handle_styling_no_input.txt');
      const systemPromptText = defaultPromptText.replace('{INTENT}', stylingIntent);
      const systemPrompt = new SystemMessage(systemPromptText);
      const response = await getTextLLM()
        .withStructuredOutput(LLMOutputSchema)
        .run(systemPrompt, conversationHistoryTextOnly, state.traceBuffer, 'handleStyling');
      const reply_text = response.message1_text as string;
      logger.debug({ userId, reply_text }, 'Returning with default LLM reply');
      const replies: Replies = [{ reply_type: 'text', reply_text }];
      return { ...state, assistantReply: replies };
    }

    const tools = [searchWardrobe(userId), fetchColorAnalysis(userId)];

    const systemPromptText = await loadPrompt(`handlers/styling/handle_${stylingIntent}.txt`);
    const systemPrompt = new SystemMessage(systemPromptText);

    const finalResponse = await agentExecutor(
      getTextLLM(),
      systemPrompt,
      conversationHistoryTextOnly,
      {
        tools,
        outputSchema: LLMOutputSchema,
        nodeName: 'handleStyling',
      },
      state.traceBuffer,
    );

    const replies: Replies = [{ reply_type: 'text', reply_text: finalResponse.message1_text }];
    if (finalResponse.message2_text) {
      replies.push({
        reply_type: 'text',
        reply_text: finalResponse.message2_text,
      });
    }

    logger.debug({ userId, replies }, 'Returning styling response');
    return { ...state, assistantReply: replies };
  } catch (err: unknown) {
    logger.error({ userId, err }, 'Error in handleStyling');
    throw new InternalServerError('Failed to handle styling request', {
      cause: err,
    });
  }
}
