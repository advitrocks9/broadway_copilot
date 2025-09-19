import OpenAI from 'openai';
import {
  ChatCompletion,
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import z from 'zod';

import { BaseChatModel } from './base_chat_model';
import { AssistantMessage, BaseMessage, SystemMessage, TextPart } from './messages';
import { ToolCall, toOpenAIToolSpec } from './tools';

export abstract class BaseChatCompletionsModel extends BaseChatModel {
  protected _buildChatCompletionsParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const system_prompt = systemPrompt.content
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: system_prompt,
      },
    ];

    for (const m of msgs) {
      if (m.role === 'user') {
        const userContent = m.content.map((c): ChatCompletionContentPart => {
          if (c.type === 'text') {
            return { type: 'text', text: c.text };
          }
          return {
            type: 'image_url',
            image_url: {
              url: c.image_url.url,
              detail: c.image_url.detail ?? 'auto',
            },
          };
        });

        messages.push({
          role: 'user',
          content: userContent,
        });
      } else if (m.role === 'assistant') {
        const textContent = m.content
          .filter((p): p is TextPart => p.type === 'text')
          .map((p) => p.text)
          .join('')
          .trim();

        const toolCalls = (m.meta?.tool_calls as ToolCall[] | undefined) ?? [];
        const assistantMessage: ChatCompletionMessageParam = {
          role: 'assistant',
        };

        if (textContent) {
          assistantMessage.content = textContent;
        }

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls.map<ChatCompletionMessageToolCall>((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          }));
        }

        messages.push(assistantMessage);
      } else if (m.role === 'tool') {
        if (!m.tool_call_id) {
          throw new Error('Tool message missing tool_call_id');
        }
        messages.push({
          role: 'tool',
          tool_call_id: m.tool_call_id,
          content: m.content
            .filter((p): p is TextPart => p.type === 'text')
            .map((p) => p.text)
            .join(''),
        });
      }
    }

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: this.params.model,
      messages,
      stream: false,
    };

    if (this.params.temperature !== undefined) {
      params.temperature = this.params.temperature;
    }
    if (this.params.maxTokens !== undefined) {
      params.max_tokens = this.params.maxTokens;
    }
    if (this.params.topP !== undefined) {
      params.top_p = this.params.topP;
    }
    if (this.params.stop !== undefined) {
      params.stop = this.params.stop;
    }
    if (this.params.seed !== undefined) {
      params.seed = this.params.seed;
    }

    if (this.boundTools.length > 0) {
      const tools: ChatCompletionTool[] = this.boundTools.map((t) => {
        const spec = toOpenAIToolSpec(t);
        return {
          type: 'function',
          function: {
            name: spec.name,
            description: spec.description ?? '',
            parameters: spec.parameters ?? {},
            strict: spec.strict ?? null,
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
          parameters: z.toJSONSchema(this.structuredOutputSchema) as Record<string, unknown>,
          strict: true,
        },
      };
      params.tools = [...(params.tools ?? []), tool];
      params.tool_choice = {
        type: 'function',
        function: { name: toolName },
      };
    }

    return params;
  }

  protected _processChatCompletionsResponse(response: ChatCompletion): {
    assistant: AssistantMessage;
    toolCalls: ToolCall[];
  } {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('Chat completion returned no choices');
    }
    const message = choice.message;

    const assistant = new AssistantMessage(message.content ?? '');
    assistant.meta = {
      raw: response,
      finish_reason: choice.finish_reason,
      logprobs: choice.logprobs,
    };

    const toolCalls = (message.tool_calls ?? [])
      .filter((tc) => tc.type === 'function')
      .map((tc) => {
        try {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments) as unknown,
          };
        } catch (e) {
          throw new Error(`Failed to parse arguments for ${tc.function.name}: ${e}`);
        }
      });

    if (toolCalls.length > 0) {
      assistant.meta.tool_calls = toolCalls;
    }
    if (message.tool_calls && message.tool_calls.length > 0) {
      assistant.meta.raw_tool_calls = message.tool_calls;
    }

    return { assistant, toolCalls };
  }
}
