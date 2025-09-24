import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import { z, ZodObject, ZodType } from 'zod';

type ToolSchema = ZodObject<Record<string, ZodType>>;

export class Tool<TSchema extends ToolSchema = ToolSchema, TResult = unknown> {
  name: string;
  description: string;
  schema: TSchema;
  func: (args: z.infer<TSchema>) => TResult | Promise<TResult>;

  constructor(config: {
    name: string;
    description: string;
    schema: TSchema;
    func: (args: z.infer<TSchema>) => TResult | Promise<TResult>;
  }) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.func = config.func;
  }
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  id: string;
  name: string;
  result: unknown;
}

export function toOpenAIToolSpec(tool: Tool): OpenAIFunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.schema) as Record<string, unknown>,
    strict: true,
  };
}
