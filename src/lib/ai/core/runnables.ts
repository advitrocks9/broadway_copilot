import { TraceBuffer } from '../../../agent/tracing';
import { BaseMessage, SystemMessage } from './messages';
import { ToolCall } from './tools';

/**
 * Defines the core parameters for configuring a chat model instance.
 * These parameters control the model's behavior during generation.
 */
export type ChatModelParams = {
  /** The specific model identifier to use for the chat completion. */
  model: string;
  /**
   * Controls randomness in the output. A lower value (e.g., 0.2) makes the
   * model more deterministic, while a higher value (e.g., 0.8) makes it more creative.
   */
  temperature?: number;
  /** The maximum number of tokens to generate in the response. */
  maxTokens?: number;
  /**
   * The nucleus sampling probability. The model will only consider tokens
   * with a cumulative probability of `topP`. (e.g., 0.9 means top 90% probability mass).
   */
  topP?: number;
  /** An array of sequences that will stop the model's generation. */
  stop?: string | string[];
  /** A seed for ensuring reproducible outputs when temperature is non-zero. */
  seed?: number;
};

// --- Provider Specific Params ---

export interface OpenAIChatModelParams extends ChatModelParams {
  /**
   * (OpenAI-specific) Enables reasoning steps or chain-of-thought,
   * which can improve performance on complex tasks.
   * Only applicable when `useResponsesApi` is `true`.
   */
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
  /**
   * (OpenAI-specific) Toggles between the Responses API and the Chat Completions API.
   * Defaults to `false` (Chat Completions API).
   */
  useResponsesApi?: boolean;
  /**
   * (OpenAI-specific) An object specifying the format that the model must output.
   * Setting to `{ type: "json_object" }` enables JSON mode.
   * Only applicable for Chat Completions API.
   */
  responseFormat?: { type: 'text' | 'json_object' };
}

export interface GroqChatModelParams extends ChatModelParams {
  /**
   * (Groq-specific) The maximum number of times to retry a request if it fails.
   * Defaults to 2.
   */
  maxRetries?: number;
  /**
   * (Groq-specific) The maximum time in milliseconds to wait for a response from the API.
   * Defaults to 1 minute.
   */
  timeout?: number;
}

/**
 * Represents the final outcome of a model run.
 *
 * @example
 * ```typescript
 * const result: RunOutcome = {
 *   assistant: new AssistantMessage('The weather in NYC is sunny.'),
 *   toolCalls: [
 *     { id: 'call_123', name: 'get_weather', arguments: { location: 'NYC' } }
 *   ],
 *   raw: openAIResponseObject // The original response from the provider
 * };
 * ```
 */
export interface RunOutcome {
  /** The assistant's response message. */
  assistant: BaseMessage;
  /** An array of tool calls requested by the assistant. Empty when none were made. */
  toolCalls: ToolCall[];
  /** The raw, unmodified response from the LLM provider for debugging. */
  raw: unknown;
}

/**
 * Defines the interface for a model runner, which is responsible for executing
 * a conversation against an LLM and returning the result.
 *
 * @example
 * ```typescript
 * class MyModelRunner implements ModelRunner {
 *   async run(
 *     systemPrompt: SystemMessage,
 *     messages: BaseMessage[],
 *     traceBuffer: TraceBuffer,
 *     nodeName: string,
 *   ): Promise<RunOutcome> {
 *     // Logic to call a specific LLM provider
 *     return {
 *       assistant: new AssistantMessage('Response from my custom model'),
 *       toolCalls: [],
 *       raw: response,
 *     };
 *   }
 * }
 * ```
 */
export interface ModelRunner {
  /**
   * Runs the model with the given conversation history.
   *
   * @param systemPrompt The system prompt to guide the model's behavior.
   * @param messages The array of messages representing the conversation history.
   * @param traceBuffer The buffer to store trace information.
   * @param nodeName The name of the graph node making this call.
   * @returns A promise that resolves to the outcome of the model run.
   */
  run(
    systemPrompt: SystemMessage,
    messages: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName: string,
  ): Promise<RunOutcome>;
}
