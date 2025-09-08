import { z } from 'zod';

import { Replies } from '../state';
import { getTextLLM } from '../../services/openaiService';
import { loadPrompt } from '../../utils/prompts';
import { getLogger } from '../../utils/logger';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ToolMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { searchWardrobe, fetchColorAnalysis } from '../tools';

/**
 * Crafts styling suggestions based on intent; outputs text reply_type.
 */
const logger = getLogger('node:handle_styling');

const LLMOutputSchema = z.object({
  message1_text: z.string().describe('The main outfit suggestion.'),
  message2_text: z
    .string()
    .nullable()
    .describe(
      'An optional, short follow-up message to ask a question or suggest the next step.',
    ),
});

export async function handleStylingNode(state: any) {
  const { stylingIntent, conversationHistoryTextOnly, userId } = state;
  const lastMessage = conversationHistoryTextOnly.at(-1);
  if (lastMessage && lastMessage instanceof HumanMessage && lastMessage.additional_kwargs?.buttonPayload && !(lastMessage.content as string).trim()) {
    const defaultPromptText = await loadPrompt('handle_styling_no_input.txt', { injectPersona: true });
    const defaultPrompt = defaultPromptText.replace('{INTENT}', stylingIntent);
    const llm = getTextLLM();
    const response = await llm.invoke(defaultPrompt);
    const reply_text = response.content as string;
    const replies: Replies = [{ reply_type: 'text', reply_text: reply_text }];
    return { ...state, assistantReply: replies };
  }
  const baseSystemPrompt = await loadPrompt(`handle_${stylingIntent}.txt`, { injectPersona: true });
  const toolSystemPrompt = `${baseSystemPrompt}\n\nYou can call tools to gather information if needed. Think step by step.\n\nAvailable tools:\n- searchWardrobe: Call this to search the user's wardrobe items using one or more descriptive queries (e.g., ["blue jeans", "summer dresses"]). Use when you need to know what clothes the user has. Do not call if you already have the info.\n- fetchColorAnalysis: Call this to get the user's color palette, top colors, and colors to avoid. Use when making color-based suggestions. Call at most once.\n\nIf you have enough information, output your final styling suggestion as text. Do not call tools unnecessarily or repeat the same call.`;

  const localSearchWardrobeSchema = z.object({ query: z.array(z.string()) });
  const localSearchWardrobe = new DynamicStructuredTool({
    name: 'searchWardrobe',
    description: "Performs a vector search on the user's wardrobe",
    schema: localSearchWardrobeSchema,
    func: async (input: unknown) => {
      const parsed = localSearchWardrobeSchema.parse(input);
      return await searchWardrobe.func({ ...parsed, userId });
    }
  });

  const localFetchColorAnalysisSchema = z.object({});
  const localFetchColorAnalysis = new DynamicStructuredTool({
    name: 'fetchColorAnalysis',
    description: "Fetches the users latest color analysis data.",
    schema: localFetchColorAnalysisSchema,
    func: async (input: unknown) => {
      localFetchColorAnalysisSchema.parse(input);
      return await fetchColorAnalysis.func({ userId });
    }
  });

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', toolSystemPrompt],
    new MessagesPlaceholder('history'),
  ]);

  const formattedPrompt = await promptTemplate.invoke({
    history: conversationHistoryTextOnly || [],
  });

  const llm = getTextLLM();
  const tools = [localSearchWardrobe, localFetchColorAnalysis];
  const llm_with_tools = llm.bindTools(tools);

  let current_messages = formattedPrompt.toChatMessages();
  const max_loops = 4;
  let loop_count = 0;

  while (loop_count < max_loops) {
    logger.info(`Starting iteration ${loop_count + 1}`);
    const response = await llm_with_tools.invoke(current_messages);
    current_messages.push(response);

    if (response.tool_calls && response.tool_calls.length > 0) {
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
            throw new Error(`Unknown tool: ${tc.name}`);
          }
          return new ToolMessage({
            content: JSON.stringify(tool_output),
            tool_call_id: tc.id!,
            name: tc.name,
          });
        } catch (e: unknown) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          return new ToolMessage({
            content: `Tool error: ${errorMsg}`,
            tool_call_id: tc.id!,
            name: tc.name,
          });
        }
      });
      const tool_messages = await Promise.all(toolPromises);
      current_messages.push(...tool_messages);
    } else {
      break;
    }
    loop_count++;
  }

  // Final structured output pass
  const finalSystem = new SystemMessage('Based on the conversation above, produce the final styling suggestion in JSON format matching this schema: { "message1_text": "string", "message2_text": "string or null" }. Do not use any tools. Output only the JSON object, nothing else.');
  current_messages.push(finalSystem);

  const final_llm = llm.bind({ response_format: { type: "json_object" } });

  let final_response;
  try {
    const aiMsg = await final_llm.invoke(current_messages);
    final_response = LLMOutputSchema.parse(JSON.parse(aiMsg.content as string));
  } catch (e) {
    logger.error(e, 'Final structured output failed');
    final_response = { message1_text: 'Sorry, I could not generate a styling suggestion at this time.', message2_text: null };
  }

  logger.info(final_response, `HandleStyling (${stylingIntent}): final output`);
  const replies: Replies = [
    { reply_type: 'text', reply_text: final_response.message1_text },
  ];
  if (final_response.message2_text) {
    replies.push({ reply_type: 'text', reply_text: final_response.message2_text });
  }

  if (loop_count >= max_loops) {
    logger.warn('Max loops reached');
  }
  return { ...state, assistantReply: replies };
}
