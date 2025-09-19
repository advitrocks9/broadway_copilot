import 'dotenv/config';

import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { ZodType } from 'zod';
import { TraceBuffer } from '../../../agent/tracing';
import { BaseMessage, SystemMessage } from './messages';
import { ChatModelParams, ModelRunner, RunOutcome } from './runnables';
import { StructuredOutputRunnable } from './structured_output_runnable';
import type { Tool } from './tools';

/**
 * Abstract base class for chat models, providing a common interface for
 * interacting with different LLM providers. It handles tool binding,
 * structured output, and the core logic of running a model.
 */
export abstract class BaseChatModel implements ModelRunner {
  protected abstract client: OpenAI | Groq;
  public params: ChatModelParams;
  protected boundTools: Tool[] = [];
  protected structuredOutputSchema: ZodType | null = null;
  public structuredOutputToolName: string = 'structured_output';

  constructor(params: ChatModelParams) {
    this.params = {
      ...params,
    };
  }

  /**
   * Binds tools to the model instance. When the model is run, it can then
   * choose to call any of the bound tools. This returns a new `BaseChatModel`
   * instance with the tools bound.
   *
   * @param tools An array of tools to bind to the model.
   * @returns A new `BaseChatModel` instance with the tools bound.
   */
  bind(tools: Tool[]): this {
    const newInstance = new (this.constructor as new (params: ChatModelParams) => this)(
      this.params,
    );
    newInstance.boundTools = [...tools];
    return newInstance;
  }

  /**
   * Chains the model with a Zod schema to produce structured, validated output.
   *
   * @param schema The Zod schema for the desired output format.
   * @returns A `StructuredOutputRunnable` instance that will return a typed object.
   */
  withStructuredOutput<T extends ZodType>(schema: T): StructuredOutputRunnable<T> {
    const newInstance = this._clone();
    newInstance.structuredOutputSchema = schema;
    return new StructuredOutputRunnable(newInstance, schema);
  }

  /**
   * Runs the model with a given conversation history and returns the outcome.
   * This method must be implemented by subclasses.
   *
   * @param systemPrompt The system prompt to guide the model's behavior.
   * @param msgs The array of messages representing the conversation history.
   * @param graphRunId The ID of the current graph run for tracing purposes.
   * @param nodeName The name of the graph node making this call.
   * @returns A promise that resolves to the outcome of the model run, including
   * the assistant's reply and any tool calls.
   */
  abstract run(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName: string,
  ): Promise<RunOutcome>;

  protected _clone(): this {
    const newInstance = new (this.constructor as new (params: ChatModelParams) => this)(
      this.params,
    );
    if (this.boundTools.length > 0) {
      newInstance.boundTools = [...this.boundTools];
    }
    if (this.structuredOutputSchema) {
      newInstance.structuredOutputSchema = this.structuredOutputSchema;
    }
    return newInstance;
  }
}
