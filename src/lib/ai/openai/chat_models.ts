import OpenAI from 'openai';
import z from 'zod';
import { createId } from '@paralleldrive/cuid2';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseFunctionToolCall,
  ResponseOutputItem,
  FunctionTool,
} from 'openai/resources/responses/responses';

import { OpenAIChatModelParams, RunOutcome } from '../core/runnables';
import {
  AssistantMessage,
  BaseMessage,
  SystemMessage,
  TextPart,
} from '../core/messages';
import { ToolCall, toOpenAIToolSpec } from '../core/tools';
import { Prisma } from '@prisma/client';
import { BaseChatCompletionsModel } from '../core/base_chat_completions_model';
import { MODEL_COSTS } from '../config/costs';
import { TraceBuffer } from '../../../agent/tracing';

/**
 * A chat model that interacts with the OpenAI API.
 * This class extends `BaseChatCompletionsModel` and is configured for the OpenAI endpoint.
 *
 * @example
 * ```typescript
 * const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
 * const result = await model.run(
 *   new SystemMessage('You are a helpful assistant.'),
 *   [new UserMessage('What is the capital of France?')],
 *   'some-graph-run-id'
 * );
 * console.log(result.assistant.content[0].text);
 * ```
 */
export class ChatOpenAI extends BaseChatCompletionsModel {
  protected client: OpenAI;
  public params: OpenAIChatModelParams;

  /**
   * Creates an instance of ChatOpenAI.
   * @param params - Optional parameters to override the model defaults.
   * @param client - An optional OpenAI client instance, useful for testing or custom configurations.
   */
  constructor(
    params: Partial<OpenAIChatModelParams> = {},
    client?: OpenAI,
  ) {
    const combinedParams: OpenAIChatModelParams = {
      model: 'gpt-4.1',
      useResponsesApi: false,
      ...params,
    };
    super(combinedParams);
    this.client = client || new OpenAI();
    this.params = combinedParams;
  }

  async run(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName?: string,
  ): Promise<RunOutcome> {
    if (this.params.useResponsesApi) {
      return this._runResponses(
        systemPrompt,
        msgs,
        traceBuffer,
        nodeName,
      );
    }
    return this._runChatCompletions(
      systemPrompt,
      msgs,
      traceBuffer,
      nodeName,
    );
  }

  private async _runResponses(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName?: string,
  ): Promise<RunOutcome> {
    const params = this._buildResponsesParams(systemPrompt, msgs);

    const nodeRun = traceBuffer.nodeRuns.find(
      ne => ne.nodeName === nodeName && !ne.endTime,
    );
    if (!nodeRun) {
      throw new Error(
        `Could not find an active node execution for nodeName: ${nodeName}`,
      );
    }

    const llmTrace: any = {
      id: createId(),
      nodeRunId: nodeRun.id,
      model: this.params.model,
      inputMessages: params.input as unknown as Prisma.JsonArray,
      rawRequest: params as unknown as Prisma.JsonObject,
      startTime: new Date(),
    };

    let response: Response;
    try {
      response = await this.client.responses.create(
        params as ResponseCreateParamsNonStreaming,
      );
    } catch (err) {
      const endTime = new Date();
      llmTrace.errorTrace = err instanceof Error ? err.stack : String(err);
      llmTrace.endTime = endTime;
      llmTrace.durationMs = endTime.getTime() - llmTrace.startTime.getTime();
      traceBuffer.llmTraces.push(llmTrace);
      throw err;
    }

    const { assistantContent, toolCalls, rawToolCalls } =
      this._processResponsesResponse(response);

    const assistant = new AssistantMessage(assistantContent);
    assistant.meta = {
      raw: response,
      tool_calls: toolCalls,
      raw_tool_calls: rawToolCalls,
    };

    const endTime = new Date();
    llmTrace.rawResponse = response as unknown as Prisma.JsonObject;
    llmTrace.outputMessage = assistant.toJSON() as Prisma.JsonObject;
    llmTrace.promptTokens = response.usage?.total_tokens; // Note: Responses API only provides total_tokens
    llmTrace.completionTokens = 0; // Note: Responses API only provides total_tokens
    llmTrace.totalTokens = response.usage?.total_tokens;
    llmTrace.endTime = endTime;
    llmTrace.durationMs = endTime.getTime() - llmTrace.startTime.getTime();
    traceBuffer.llmTraces.push(llmTrace);

    return {
      assistant,
      toolCalls,
      raw: response,
    };
  }

  private async _runChatCompletions(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName?: string,
  ): Promise<RunOutcome> {
    const params = this._buildChatCompletionsParams(systemPrompt, msgs);

    const nodeRun = traceBuffer.nodeRuns.find(
      ne => ne.nodeName === nodeName && !ne.endTime,
    );
    if (!nodeRun) {
      throw new Error(
        `Could not find an active node execution for nodeName: ${nodeName}`,
      );
    }

    const llmTrace: any = {
      id: createId(),
      nodeRunId: nodeRun.id,
      model: this.params.model,
      inputMessages: params.messages as unknown as Prisma.JsonArray,
      rawRequest: params as unknown as Prisma.JsonObject,
      startTime: new Date(),
    };

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(params);
    } catch (err) {
      const endTime = new Date();
      llmTrace.errorTrace = err instanceof Error ? err.stack : String(err);
      llmTrace.endTime = endTime;
      llmTrace.durationMs = endTime.getTime() - llmTrace.startTime.getTime();
      traceBuffer.llmTraces.push(llmTrace);
      throw err;
    }

    const { assistant, toolCalls } =
      this._processChatCompletionsResponse(response);

    const endTime = new Date();

    let costUsd: number | null = null;
    const modelCosts = MODEL_COSTS[this.params.model];
    if (modelCosts) {
      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const inputCost = (promptTokens / 1_000_000) * modelCosts.input;
      const outputCost = (completionTokens / 1_000_000) * modelCosts.output;
      costUsd = inputCost + outputCost;
    }

    llmTrace.rawResponse = response as unknown as Prisma.JsonObject;
    llmTrace.outputMessage = assistant.toJSON() as Prisma.JsonObject;
    llmTrace.promptTokens = response.usage?.prompt_tokens;
    llmTrace.completionTokens = response.usage?.completion_tokens;
    llmTrace.totalTokens = response.usage?.total_tokens;
    llmTrace.costUsd = costUsd;
    llmTrace.endTime = endTime;
    llmTrace.durationMs = endTime.getTime() - llmTrace.startTime.getTime();
    traceBuffer.llmTraces.push(llmTrace);

    return {
      assistant,
      toolCalls,
      raw: response,
    };
  }

  protected _buildResponsesParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): ResponseCreateParamsNonStreaming {
    const instructions = systemPrompt.content
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join('');

    const input: ResponseInputItem[] = msgs.flatMap(m => {
      if (m.role === 'tool') {
        return {
          type: 'function_call_output',
          call_id: m.tool_call_id!,
          output: m.content
            .filter((p): p is TextPart => p.type === 'text')
            .map(p => p.text)
            .join(''),
        };
      }

      if (m.role === 'assistant') {
        const items: ResponseInputItem[] = [];
        const textContent = m.content
          .filter((p): p is TextPart => p.type === 'text')
          .map(p => p.text)
          .join('')
          .trim();

        if (textContent) {
          items.push({
            role: 'assistant',
            content: textContent,
          });
        }

        const rawToolCalls = m.meta?.raw_tool_calls as
          | ResponseFunctionToolCall[]
          | undefined;
        if (rawToolCalls?.length) {
          items.push(...rawToolCalls);
        }
        return items;
      }

      // User messages
      return {
        role: 'user',
        content: m.content.map(c => {
          if (c.type === 'text') {
            return { type: 'input_text' as const, text: c.text };
          }
          // ImagePart
          return {
            type: 'input_image' as const,
            image_url: c.image_url.url,
            detail: c.image_url.detail || 'auto',
          };
        }),
      };
    });

    const tools = this.boundTools?.map(toOpenAIToolSpec);

    const params: ResponseCreateParamsNonStreaming = {
      model: this.params.model,
      input,
      temperature: this.params.temperature,
      max_output_tokens: this.params.maxTokens,
      top_p: this.params.topP,
      stream: false,
    };

    if (instructions) {
      params.instructions = instructions;
    }

    if (this.params.reasoning) {
      params.reasoning = this.params.reasoning;
    }

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = 'auto';
    }

    if (this.structuredOutputSchema) {
      const toolName = this.structuredOutputToolName;
      const tool: FunctionTool = {
        type: 'function',
        name: toolName,
        description: 'Structured output formatter',
        parameters: z.toJSONSchema(this.structuredOutputSchema),
        strict: true,
      };
      params.tools = [...(params.tools || []), tool];
      params.tool_choice = {
        type: 'function',
        name: toolName,
      };
    }

    return params;
  }

  protected _buildChatCompletionsParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const params = super._buildChatCompletionsParams(systemPrompt, msgs);
    if (this.params.responseFormat) {
      params.response_format = this.params.responseFormat;
    }
    return params;
  }

  protected _processResponsesResponse(response: Response): {
    assistantContent: string;
    toolCalls?: ToolCall[];
    rawToolCalls?: ResponseFunctionToolCall[];
  } {
    const assistantContent: string = response.output_text ?? '';
    const output: ResponseOutputItem[] = response.output ?? [];

    const rawToolCalls = output.filter(
      (item): item is ResponseFunctionToolCall =>
        item?.type === 'function_call',
    );

    const toolCalls: ToolCall[] = rawToolCalls.map(item => {
      try {
        return {
          id: item.call_id,
          name: item.name,
          arguments: item.arguments ? JSON.parse(item.arguments) : {},
        };
      } catch (e) {
        throw new Error(`Failed to parse arguments for ${item.name}: ${e}`);
      }
    });

    return {
      assistantContent,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      rawToolCalls: rawToolCalls.length ? rawToolCalls : undefined,
    };
  }
}
