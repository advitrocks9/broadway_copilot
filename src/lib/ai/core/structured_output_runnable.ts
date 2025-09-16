import { z, ZodType } from 'zod';
import { BaseMessage, SystemMessage, TextPart } from './messages';
import { BaseChatModel } from './base_chat_model';
import { TraceBuffer } from '../../../agent/tracing';

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
    private schema: T
  ) {}


  private _extractJson(text: string): string {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return match ? match[1] : text;
  }

  private _coerceSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
    const def = schema._def as any;
    const typeName = def.typeName;

    if (typeName === 'ZodEffects') {
      const effectsSchema = def.schema;
      return this._coerceSchema(effectsSchema);
    } else if (typeName === 'ZodNumber') {
      return z.coerce.number();
    } else if (typeName === 'ZodBigInt') {
      return z.coerce.bigint();
    } else if (typeName === 'ZodBoolean') {
      return z.coerce.boolean();
    } else if (typeName === 'ZodDate') {
      return z.coerce.date();
    } else if (typeName === 'ZodString') {
      return z.coerce.string();
    } else if (typeName === 'ZodArray') {
      const elementSchema = this._coerceSchema(def.type);
      return z.preprocess((val) => {
        if (typeof val === 'string' && val.trim().length > 0) {
          return val.split(',').map((item) => item.trim()).filter((item) => item !== '');
        }
        return val;
      }, z.array(elementSchema));
    } else if (typeName === 'ZodObject') {
      const shape = def.shape();
      const newShape: { [key: string]: z.ZodTypeAny } = {};
      for (const key in shape) {
        newShape[key] = this._coerceSchema(shape[key]);
      }
      return z.object(newShape);
    } else if (typeName === 'ZodOptional') {
      const inner = def.innerType;
      return this._coerceSchema(inner).optional();
    } else if (typeName === 'ZodNullable') {
      const inner = def.innerType;
      return this._coerceSchema(inner).nullable();
    } else if (typeName === 'ZodUnion') {
      const options = def.options;
      return z.union(options.map((opt: z.ZodTypeAny) => this._coerceSchema(opt)));
    } else if (typeName === 'ZodIntersection') {
      const left = def.left;
      const right = def.right;
      return z.intersection(this._coerceSchema(left), this._coerceSchema(right));
    } else {
      // Fallback: check the type property for basic types
      if (def.type === 'string') {
        return z.coerce.string();
      } else if (def.type === 'number') {
        return z.coerce.number();
      } else if (def.type === 'boolean') {
        return z.coerce.boolean();
      } else if (def.type === 'object' && def.shape) {
        const shape = def.shape;
        const newShape: { [key: string]: z.ZodTypeAny } = {};
        for (const key in shape) {
          newShape[key] = this._coerceSchema(shape[key]);
        }
        return z.object(newShape);
      }
      return schema;
    }
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
    nodeName?: string,
  ): Promise<T['_output']> {
    const response = await this.runner.run(
      systemPrompt,
      messages,
      traceBuffer,
      nodeName,
    );
    const { toolCalls } = response;

    let data;

    if (toolCalls && toolCalls.length > 0) {
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
        data = JSON.parse(jsonString);
      } catch (error) {
        throw new Error(
          `Failed to parse structured output as JSON: ${error}\nContent: ${jsonString}`
        );
      }
    }

    try {
      const coercedSchema = this._coerceSchema(this.schema);
      return coercedSchema.parse(data);
    } catch (error) {
      throw new Error(
        `Failed to validate structured output: ${error}\nData: ${JSON.stringify(
          data,
          null,
          2
        )}`
      );
    }
  }
}
