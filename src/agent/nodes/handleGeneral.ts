import { z } from 'zod';

import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ToolMessage, SystemMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';

import { getTextLLM } from '../../lib/llm';
import { createError } from '../../utils/errors';
import { WELCOME_IMAGE_URL } from '../../utils/constants';
import { loadPrompt } from '../../utils/prompts';
import { logger } from '../../utils/logger';
import { fetchRelevantMemories } from '../tools';
import { Replies, GeneralIntent } from '../state';

const SingleMessageOutputSchema = z.object({
  reply_text: z.string().describe('The text response to the user.'),
});

const ChatOutputSchema = z.object({
  message1_text: z.string().describe('The primary text response to the user.'),
  message2_text: z
    .string()
    .nullable()
    .describe('An optional second message to provide more details or continue the conversation.'),
});

/**
 * Generates a simple quick-reply response with optional image hero.
 */
async function handleSimpleQuickReply(
  state: any,
  promptFile: string,
  addImage: boolean = false
): Promise<Partial<any>> {
  const { user } = state;
  const systemPrompt = await loadPrompt(promptFile, { injectPersona: true });
  const llm = getTextLLM().withStructuredOutput(SingleMessageOutputSchema);
  const response = await llm.invoke(systemPrompt);

  const availableActions = [
    { text: 'Vibe check', id: 'vibe_check' },
    { text: 'Color analysis', id: 'color_analysis' },
    { text: 'Styling', id: 'styling' },
  ];

  const replies: Replies = [];
  if (addImage) {
    replies.push({ reply_type: 'image', media_url: WELCOME_IMAGE_URL });
  }
  replies.push({
    reply_type: 'quick_reply',
    reply_text: response.reply_text,
    buttons: availableActions,
  });

  const intentName = promptFile.split('.')[0].replace('handle_', '');
  logger.info({ userId: user?.id }, `${intentName} handled`);
  return { assistantReply: replies };
}

/**
 * Handles greeting flow with menu quick-replies.
 */
async function handleGreeting(state: any): Promise<Partial<any>> {
  return handleSimpleQuickReply(state, 'handle_greeting.txt', true);
}

/**
 * Returns the main menu via quick-replies.
 */
async function handleMenu(state: any): Promise<Partial<any>> {
  return handleSimpleQuickReply(state, 'handle_menu.txt');
}

/**
 * Orchestrates open chat with tool-calling loop for memory recall.
 */
async function handleChat(state: any): Promise<Partial<any>> {
  const userId = state.user?.id;
  const messageId = state.input?.MessageSid;
  const { conversationHistoryTextOnly } = state;

  const localFetchMemoriesSchema = z.object({
    query: z.string().describe('The query to search for relevant memories'),
  });

  const localFetchRelevantMemories = new DynamicStructuredTool({
    name: 'fetchRelevantMemories',
    description:
      "Fetches relevant user memories based on a query. Use this to recall user's preferences, past interactions, or personal info.",
    schema: localFetchMemoriesSchema,
    func: async (input: unknown) => {
      const parsed = localFetchMemoriesSchema.parse(input);
      return await fetchRelevantMemories.func({ userId, ...parsed });
    },
  });

  const tools = [localFetchRelevantMemories];

  const systemPrompt = await loadPrompt('handle_chat.txt', { injectPersona: true });

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    new MessagesPlaceholder('history'),
  ]);

  const formattedPrompt = await promptTemplate.invoke({
    history: conversationHistoryTextOnly || [],
  });

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
        if (tc.name !== 'fetchRelevantMemories') {
          throw createError.internalServerError(`Unknown tool: ${tc.name}`);
        }
        const args = localFetchMemoriesSchema.parse(tc.args);
        const tool_output = await localFetchRelevantMemories.func(args);
        return new ToolMessage({
          content: JSON.stringify(tool_output),
          tool_call_id: tc.id!,
          name: tc.name,
        });
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        logger.error(
          {
            userId,
            messageId,
            tool_name: tc.name,
            error: errorMsg,
            stack: e instanceof Error ? e.stack : undefined,
          },
          'Tool call failed'
        );
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
    logger.warn(
      { userId, messageId, loop_count, max_loops },
      'Max tool loops reached in general handling'
    );
  }

  const finalSystem = new SystemMessage(
    'Based on the conversation above, produce the final response in JSON format matching this schema: { "message1_text": string, "message2_text": string | null }. Do not use any tools. Output only the JSON object, nothing else.'
  );
  current_messages.push(finalSystem);

  const final_llm = llm.withStructuredOutput(ChatOutputSchema);

  let final_response;
  try {
    final_response = await final_llm.invoke(current_messages);
  } catch (e: any) {
    logger.error({ userId, messageId, err: e.message, stack: e.stack }, 'Final structured output failed');
    final_response = {
      message1_text: "I'm sorry, I encountered an issue. How can I assist you?",
      message2_text: null,
    };
  }

  const replies: Replies = [{ reply_type: 'text', reply_text: final_response.message1_text }];
  if (final_response.message2_text) {
    replies.push({ reply_type: 'text', reply_text: final_response.message2_text });
  }

  logger.info({ userId, messageId, replyCount: replies.length }, 'Chat handled');
  return { assistantReply: replies };
}

/**
 * Handles general conversation intents such as greeting, menu, or open chat.
 * @param state Agent state containing user, conversation history, and routing info.
 */
export async function handleGeneralNode(state: any) {
  const userId = state.user?.id;
  const messageId = state.input?.MessageSid;
  const generalIntent: GeneralIntent = state.generalIntent;

  try {
    switch (generalIntent) {
      case 'greeting':
        return await handleGreeting(state);
      case 'menu':
        return await handleMenu(state);
      case 'chat':
        return await handleChat(state);
      default:
        logger.warn({ userId, messageId, generalIntent }, 'Unknown general intent, defaulting to chat');
        return await handleChat(state);
    }
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    const replies: Replies = [
      {
        reply_type: 'text',
        reply_text: "I'm not sure how to help with that. Could you try asking in a different way?",
      },
    ];
    return { assistantReply: replies };
  }
}
