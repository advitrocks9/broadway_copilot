import { ZodType } from 'zod';
import { TraceBuffer } from '../../../agent/tracing';
import { BaseChatModel } from './base_chat_model';
import { BaseMessage, SystemMessage, TextPart } from './messages';

export class StructuredOutputRunnable<T extends ZodType> {
  constructor(
    private runner: BaseChatModel,
    private schema: T,
  ) {}

  private _extractJson(text: string): string {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return match?.[1] ?? text;
  }

  private _coerceSchema(schema: ZodType): ZodType {
    return schema;
  }

  async run(
    systemPrompt: SystemMessage,
    messages: BaseMessage[],
    traceBuffer: TraceBuffer,
    nodeName: string,
  ): Promise<T['_output']> {
    const response = await this.runner.run(systemPrompt, messages, traceBuffer, nodeName);
    const { toolCalls } = response;

    let data: unknown;

    if (toolCalls.length > 0) {
      const structuredToolCall = toolCalls.find(
        (tc) => tc.name === this.runner.structuredOutputToolName,
      );
      if (structuredToolCall) {
        data = structuredToolCall.arguments;
      }
    }

    if (data === undefined) {
      const textContent = response.assistant.content
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text)
        .join('');

      const jsonString = this._extractJson(textContent);

      if (jsonString === '') {
        throw new Error(`Failed to extract JSON from model output. Content: ${textContent}`);
      }

      try {
        data = JSON.parse(jsonString) as unknown;
      } catch (error) {
        throw new Error(
          `Failed to parse structured output as JSON: ${error}\nContent: ${jsonString}`,
        );
      }
    }

    try {
      const coercedSchema = this._coerceSchema(this.schema);
      return coercedSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to validate structured output: ${error}\nData: ${JSON.stringify(data, null, 2)}`,
      );
    }
  }
}
