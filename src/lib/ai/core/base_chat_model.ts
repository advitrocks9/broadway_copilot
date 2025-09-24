import 'dotenv/config';

import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { ZodType } from 'zod';
import { TraceBuffer } from '../../../agent/tracing';
import { BaseMessage, SystemMessage } from './messages';
import { ChatModelParams, ModelRunner, RunOutcome } from './runnables';
import { StructuredOutputRunnable } from './structured_output_runnable';
import type { Tool } from './tools';

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

  bind(tools: Tool[]): this {
    const newInstance = new (this.constructor as new (params: ChatModelParams) => this)(
      this.params,
    );
    newInstance.boundTools = [...tools];
    return newInstance;
  }

  withStructuredOutput<T extends ZodType>(schema: T): StructuredOutputRunnable<T> {
    const newInstance = this._clone();
    newInstance.structuredOutputSchema = schema;
    return new StructuredOutputRunnable(newInstance, schema);
  }

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
