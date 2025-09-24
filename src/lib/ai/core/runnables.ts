import { TraceBuffer } from '../../../agent/tracing';
import { BaseMessage, SystemMessage } from './messages';
import { ToolCall } from './tools';

export type ChatModelParams = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string | string[];
  seed?: number;
};

// --- Provider Specific Params ---

export interface OpenAIChatModelParams extends ChatModelParams {
  /** Only applicable when useResponsesApi is true */
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
  /** Toggles between Responses API and Chat Completions API (default: false) */
  useResponsesApi?: boolean;
  /** Only applicable for Chat Completions API */
  responseFormat?: { type: 'text' | 'json_object' };
}

export interface GroqChatModelParams extends ChatModelParams {
  maxRetries?: number;
  timeout?: number;
}

export interface RunOutcome {
  assistant: BaseMessage;
  toolCalls: ToolCall[];
  raw: unknown;
}

export interface ModelRunner {
  run(
    systemPrompt: SystemMessage,
    messages: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName: string,
  ): Promise<RunOutcome>;
}
