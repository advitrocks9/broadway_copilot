import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ToolMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';

import { getTextLLM } from '../../lib/llm';
import { createError } from '../../utils/errors';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';

import { searchWardrobe, fetchColorAnalysis } from '../tools';
import { Replies } from '../state';

/**
 * Structured output schema for final styling suggestion from LLM.
 * Defines the format for the generated fashion recommendation response.
 */
const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The main outfit suggestion.'),
  message2_text: z
    .string()
    .nullable()
    .describe(
      'An optional, short follow-up message to ask a question or suggest the next step.',
    ),
});

/**
 * Handles styling requests by coordinating wardrobe search and color analysis tools.
 * Uses LLM with tool calling to generate personalized fashion suggestions based on
 * user intent (occasion, vacation, pairing, suggest) and available wardrobe data.
 *
 * @param state - Agent graph state containing user data, styling intent, and conversation history
 * @returns Updated state with assistant reply containing styling suggestions
 */
export async function handleStylingNode(state: any) {
  const userId = state.user?.id;
  const { stylingIntent, conversationHistoryTextOnly } = state;

  try {
    const lastMessage = conversationHistoryTextOnly?.at(-1);

    // Handle button-only messages
    if (lastMessage?.additional_kwargs?.buttonPayload) {
      const defaultPromptText = await loadPrompt('handle_styling_no_input.txt', { injectPersona: true });
      const defaultPrompt = defaultPromptText.replace('{INTENT}', stylingIntent);
      const llm = getTextLLM();
      const response = await llm.invoke(defaultPrompt);
      const reply_text = response.content as string;
      logger.debug({ userId, reply_text }, 'Returning with default LLM reply');
      const replies: Replies = [{ reply_type: 'text', reply_text }];
      return { ...state, assistantReply: replies };
    }

    // Prepare tools
    const localSearchWardrobeSchema = z.object({ query: z.array(z.string()) });
    const localSearchWardrobe = new DynamicStructuredTool({
      name: 'searchWardrobe',
      description: "Performs a vector search on the user's wardrobe",
      schema: localSearchWardrobeSchema,
      func: async (input: unknown) => {
        const parsed = localSearchWardrobeSchema.parse(input);
        return await searchWardrobe.func({ ...parsed, userId });
      },
    });

    const localFetchColorAnalysisSchema = z.object({});
    const localFetchColorAnalysis = new DynamicStructuredTool({
      name: 'fetchColorAnalysis',
      description: "Fetches the users latest color analysis data.",
      schema: localFetchColorAnalysisSchema,
      func: async (input: unknown) => {
        localFetchColorAnalysisSchema.parse(input);
        return await fetchColorAnalysis.func({ userId });
      },
    });

    const tools = [localSearchWardrobe, localFetchColorAnalysis];

    // Prepare prompt
    const systemPrompt = await loadPrompt(`handle_${stylingIntent}.txt`, { injectPersona: true });

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      new MessagesPlaceholder('history'),
    ]);

    const formattedPrompt = await promptTemplate.invoke({
      history: conversationHistoryTextOnly || [],
    });

    // Tool calling loop
    const llm = getTextLLM();
    const llm_with_tools = llm.bindTools(tools);

    let current_messages = formattedPrompt.toChatMessages();
    const max_loops = 4;
    let loop_count = 0;

    while (loop_count < max_loops) {
      const response = await llm_with_tools.invoke(current_messages);
      current_messages.push(response);

      if (!response.tool_calls || response.tool_calls.length === 0) {
        break;
      }

      const toolPromises = response.tool_calls.map(async (tc) => {
        try {
          let tool_output;
          if (tc.name === 'searchWardrobe') {
            const parsed = localSearchWardrobeSchema.parse(tc.args);
            tool_output = await searchWardrobe.func({ ...parsed, userId });
          } else if (tc.name === 'fetchColorAnalysis') {
            localFetchColorAnalysisSchema.parse(tc.args);
            tool_output = await fetchColorAnalysis.func({ userId });
          } else {
            throw createError.internalServerError(`Unknown tool: ${tc.name}`);
          }
          return new ToolMessage({
            content: JSON.stringify(tool_output),
            tool_call_id: tc.id!,
            name: tc.name,
          });
        } catch (e: unknown) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          logger.error({ userId, tool_name: tc.name, error: errorMsg, stack: (e as Error).stack }, 'Tool call failed');
          return new ToolMessage({
            content: `Tool error: ${errorMsg}`,
            tool_call_id: tc.id!,
            name: tc.name,
          });
        }
      });

      const tool_messages = await Promise.all(toolPromises);
      current_messages.push(...tool_messages);

      loop_count++;
    }

    if (loop_count >= max_loops) {
      logger.warn({ userId, loopCount: loop_count, maxLoops: max_loops }, 'Max tool loops reached');
    }

    // Final structured output
    const finalSystem = new SystemMessage(
      'Based on the conversation above, produce the final styling suggestion in JSON format matching this schema: { "message1_text": "string", "message2_text": "string or null" }. Do not use any tools. Output only the JSON object, nothing else.'
    );
    current_messages.push(finalSystem);

    const final_llm = llm.withStructuredOutput(LLMOutputSchema);

    let final_response;
    try {
      final_response = await final_llm.invoke(current_messages);
    } catch (e: any) {
      logger.error({ userId, err: e.message, stack: e.stack }, 'Final structured output failed');
      final_response = { message1_text: 'Sorry, I could not generate a styling suggestion at this time.', message2_text: null };
    }

    const replies: Replies = [{ reply_type: 'text', reply_text: final_response.message1_text }];
    if (final_response.message2_text) {
      replies.push({ reply_type: 'text', reply_text: final_response.message2_text });
    }

    logger.debug({ userId, replies, toolLoops: loop_count }, 'Returning styling response');
    return { ...state, assistantReply: replies };
  } catch (err: any) {
    logger.error({ userId, err: err.message, stack: err.stack }, 'Error handling styling intent');
    const replies: Replies = [{ reply_type: 'text', reply_text: "I'm having trouble with that request. Let's try something else." }];
    return { ...state, assistantReply: replies };
  }
}

