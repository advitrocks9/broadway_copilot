import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { ChatCompletion } from 'openai/resources/chat/completions';

import type { ChatCompletionCreateParamsNonStreaming as GroqChatCompletionParams } from 'groq-sdk/resources/chat/completions';
import { BufferedLlmTrace, TraceBuffer } from '../../../agent/tracing';
import { MODEL_COSTS } from '../config/costs';
import { BaseChatCompletionsModel } from '../core/base_chat_completions_model';
import { BaseMessage, SystemMessage, TextPart } from '../core/messages';
import { GroqChatModelParams, RunOutcome } from '../core/runnables';

/**
 * A chat model that interacts with the Groq API.
 * This class extends `BaseChatCompletionsModel` and is configured for Groq's endpoint.
 *
 * @example
 * ```typescript
 * const model = new ChatGroq({ model: 'llama3-70b-8192' });
 * const result = await model.run(
 *   new SystemMessage('You are a helpful assistant.'),
 *   [new UserMessage('Explain the importance of low-latency LLMs')],
 *   'some-graph-run-id'
 * );
 * console.log(result.assistant.content[0].text);
 * ```
 */
export class ChatGroq extends BaseChatCompletionsModel {
  protected client: Groq;
  public params: GroqChatModelParams;

  /**
   * Creates an instance of ChatGroq.
   * @param params - Optional parameters to override the model defaults.
   * @param client - An optional Groq client instance, useful for testing or custom configurations.
   */
  constructor(params: Partial<GroqChatModelParams> = {}) {
    const combinedParams: GroqChatModelParams = {
      model: 'llama3-70b-8192',
      ...params,
    };
    super(combinedParams);
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    this.structuredOutputToolName = 'json';
    this.params = combinedParams;
  }

  async run(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName: string,
  ): Promise<RunOutcome> {
    const params = this._buildChatCompletionsParams(systemPrompt, msgs);

    const requestOptions: { maxRetries?: number; timeout?: number } = {};
    if (this.params.maxRetries !== undefined) {
      requestOptions.maxRetries = this.params.maxRetries;
    }
    if (this.params.timeout !== undefined) {
      requestOptions.timeout = this.params.timeout;
    }

    const nodeRun = traceBuffer.nodeRuns.find((ne) => ne.nodeName === nodeName && !ne.endTime);
    if (!nodeRun) {
      throw new Error(`Could not find an active node execution for nodeName: ${nodeName}`);
    }

    const startTime = new Date();

    const llmTrace: BufferedLlmTrace = {
      id: createId(),
      nodeRunId: nodeRun.id,
      model: this.params.model,
      inputMessages: params.messages as unknown as Prisma.JsonArray,
      rawRequest: params as unknown as Prisma.JsonObject,
      startTime,
    };

    let response: ChatCompletion;
    try {
      response = (await this.client.chat.completions.create(
        params as unknown as GroqChatCompletionParams,
        requestOptions,
      )) as ChatCompletion;
    } catch (err) {
      const endTime = new Date();
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      llmTrace.errorTrace = stack ?? message;
      llmTrace.endTime = endTime;
      llmTrace.durationMs = endTime.getTime() - startTime.getTime();
      traceBuffer.llmTraces.push(llmTrace);
      throw err;
    }

    const { assistant, toolCalls } = this._processChatCompletionsResponse(response);

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
    llmTrace.promptTokens = response.usage?.prompt_tokens ?? null;
    llmTrace.completionTokens = response.usage?.completion_tokens ?? null;
    llmTrace.totalTokens = response.usage?.total_tokens ?? null;
    llmTrace.costUsd = costUsd ?? null;
    llmTrace.endTime = endTime;
    llmTrace.durationMs = endTime.getTime() - startTime.getTime();
    traceBuffer.llmTraces.push(llmTrace);

    return {
      assistant,
      toolCalls,
      raw: response,
    };
  }

  protected _buildChatCompletionsParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
    const params = super._buildChatCompletionsParams(systemPrompt, msgs);

    // Groq doesn't support image inputs, so we need to filter them out
    params.messages = params.messages.map((m) => {
      if (m.role === 'user' && Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content
            .filter((c): c is TextPart => c.type === 'text')
            .map((c) => c.text)
            .join(''),
        };
      }
      return m;
    });

    return params;
  }
}
