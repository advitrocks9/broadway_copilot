import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { ChatCompletion } from 'openai/resources/chat/completions';

import { traceLLMCall } from '../core/base_chat_model';
import { GroqChatModelParams, RunOutcome } from '../core/runnables';
import {
  BaseMessage,
  SystemMessage,
  TextPart,
} from '../core/messages';
import { prisma } from '../../../lib/prisma';
import { BaseChatCompletionsModel } from '../core/base_chat_completions_model';
import { MODEL_COSTS } from '../config/costs';

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
  constructor(params: Partial<GroqChatModelParams> = {}, client?: Groq) {
    const combinedParams: GroqChatModelParams = {
      model: 'llama3-70b-8192',
      ...params,
    };
    super(combinedParams);
    this.client =
      client ||
      new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
    this.structuredOutputToolName = 'json';
    this.params = combinedParams;
  }

  async run(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    graphRunId: string,
    nodeName?: string,
  ): Promise<RunOutcome> {
    const params = this._buildChatCompletionsParams(systemPrompt, msgs);

    const requestOptions: { maxRetries?: number; timeout?: number } = {};
    if (this.params.maxRetries !== undefined) {
      requestOptions.maxRetries = this.params.maxRetries;
    }
    if (this.params.timeout !== undefined) {
      requestOptions.timeout = this.params.timeout;
    }

    const { response, llmTrace } = await traceLLMCall(
      graphRunId,
      this.params,
      msgs,
      params,
      () =>
        this.client.chat.completions.create(
          params as any,
          requestOptions,
        ),
      nodeName,
    );

    const typedResponse = response as ChatCompletion;

    const { assistant, toolCalls } =
      this._processChatCompletionsResponse(typedResponse);

    const endTime = new Date();

    let costUsd: number | null = null;
    const modelCosts = MODEL_COSTS[this.params.model];
    if (modelCosts) {
      const promptTokens = typedResponse.usage?.prompt_tokens ?? 0;
      const completionTokens = typedResponse.usage?.completion_tokens ?? 0;
      const inputCost = (promptTokens / 1_000_000) * modelCosts.input;
      const outputCost = (completionTokens / 1_000_000) * modelCosts.output;
      costUsd = inputCost + outputCost;
    }

    await prisma.lLMTrace.update({
      where: { id: llmTrace.id },
      data: {
        rawResponse: response as any,
        outputMessage: assistant.toJSON() as Prisma.JsonObject,
        promptTokens: typedResponse.usage?.prompt_tokens,
        completionTokens: typedResponse.usage?.completion_tokens,
        totalTokens: typedResponse.usage?.total_tokens,
        costUsd,
        endTime,
        durationMs: endTime.getTime() - llmTrace.startTime.getTime(),
      },
    });

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
    params.messages = params.messages.map(m => {
      if (m.role === 'user' && Array.isArray(m.content)) {
        return {
          ...m,
          content: m.content
            .filter((c): c is TextPart => c.type === 'text')
            .map(c => c.text)
            .join(''),
        };
      }
      return m;
    });

    return params;
  }
}
