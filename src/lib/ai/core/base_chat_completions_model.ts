import z from 'zod';
import OpenAI from 'openai';
import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions';

import { BaseChatModel } from './base_chat_model';
import {
  AssistantMessage,
  BaseMessage,
  SystemMessage,
  TextPart,
} from './messages';
import { ToolCall, toOpenAIToolSpec } from './tools';

export abstract class BaseChatCompletionsModel extends BaseChatModel {
  protected _buildChatCompletionsParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const system_prompt = systemPrompt.content
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join('');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: system_prompt,
      },
    ];

    for (const m of msgs) {
      if (m.role === 'user') {
        messages.push({
          role: 'user',
          content: m.content.map(c => {
            if (c.type === 'text') {
              return { type: 'text', text: c.text };
            }
            return {
              type: 'image_url',
              image_url: {
                url: c.image_url.url,
                detail: c.image_url.detail,
              },
            };
          }),
        });
      } else if (m.role === 'assistant') {
        const textContent = m.content
          .filter((p): p is TextPart => p.type === 'text')
          .map(p => p.text)
          .join('')
          .trim();

        const toolCalls = m.meta?.tool_calls as ToolCall[] | undefined;

        messages.push({
          role: 'assistant',
          content: textContent,
          tool_calls: toolCalls?.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (m.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: m.tool_call_id!,
          content: m.content
            .filter((p): p is TextPart => p.type === 'text')
            .map(p => p.text)
            .join(''),
        });
      }
    }

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: this.params.model,
        messages: messages,
        temperature: this.params.temperature,
        max_tokens: this.params.maxTokens,
        top_p: this.params.topP,
        stream: false,
      };

    if (this.params.seed) {
      params.seed = this.params.seed;
    }

    if (this.boundTools && this.boundTools.length > 0) {
      const tools: ChatCompletionTool[] | undefined = this.boundTools?.map(t => {
        const spec = toOpenAIToolSpec(t);
        return {
          type: spec.type,
          function: {
            name: spec.name,
            description: spec.description ?? undefined,
            parameters: spec.parameters ?? {},
          },
        };
      });
      params.tools = tools;
      params.tool_choice = 'auto';
    }

    if (this.structuredOutputSchema) {
      const toolName = this.structuredOutputToolName;
      const tool: ChatCompletionTool = {
        type: 'function',
        function: {
          name: toolName,
          description: 'Structured output formatter',
          parameters: z.toJSONSchema(this.structuredOutputSchema),
        },
      };
      params.tools = [...(params.tools || []), tool];
      params.tool_choice = {
        type: 'function',
        function: { name: toolName },
      } as ChatCompletionToolChoiceOption;
    }

    return params;
  }

  protected _processChatCompletionsResponse(response: ChatCompletion): {
    assistant: AssistantMessage;
    toolCalls?: ToolCall[];
  } {
    const choice = response.choices[0];
    const message = choice.message;

    const assistant = new AssistantMessage(message.content ?? '');
    assistant.meta = {
      raw: response,
      finish_reason: choice.finish_reason,
      logprobs: choice.logprobs,
    };

    const toolCalls: ToolCall[] | undefined = message.tool_calls
      ?.filter(tc => tc.type === 'function')
      .map(tc => {
        try {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          };
        } catch (e) {
          throw new Error(
            `Failed to parse arguments for ${tc.function.name}: ${e}`,
          );
        }
      });

    assistant.meta.tool_calls = toolCalls;
    assistant.meta.raw_tool_calls = message.tool_calls;

    return {
      assistant,
      toolCalls,
    };
  }
}
