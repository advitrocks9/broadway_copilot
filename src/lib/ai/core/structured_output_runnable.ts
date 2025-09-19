import { ZodType } from 'zod';
import { TraceBuffer } from '../../../agent/tracing';
import { BaseChatModel } from './base_chat_model';
import { BaseMessage, SystemMessage, TextPart } from './messages';

/**
 * A runnable that wraps a chat model and forces it to produce a JSON object
 * that conforms to a provided Zod schema. It handles JSON extraction, parsing,
 * and validation, returning a typed object on success.
 *
 * @template T The Zod type of the schema.
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string().describe('The name of the user'),
 *   age: z.number().describe('The age of the user'),
 * });
 *
 * const structuredModel = model.withStructuredOutput(schema);
 * const result = await structuredModel.run(
 *   [new UserMessage('Extract info from: John Doe is 30 years old.')]
 * );
 * // result is { name: 'John Doe', age: 30 }
 * ```
 */
export class StructuredOutputRunnable<T extends ZodType> {
  /**
   * @param runner The model runner to wrap.
   * @param schema The Zod schema to validate the output against.
   */
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

  /**
   * Executes the model and parses the output according to the schema.
   *
   * @param messages The messages to send to the model.
   * @returns A promise that resolves to the parsed and validated output object.
   * @throws An error if the model output is not valid JSON or does not
   * match the provided schema.
   *
   * @example
   * ```typescript
   * const result = await structuredModel.run(
   *   [new UserMessage('My name is Jane, I am 25.')]
   * );
   * // result is fully typed and validated: { name: 'Jane', age: 25 }
   * ```
   */
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
