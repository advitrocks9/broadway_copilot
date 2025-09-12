import OpenAI from 'openai';
import z, { ZodType } from 'zod';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseFunctionToolCall,
  ResponseOutputItem,
  FunctionTool,
} from 'openai/resources/responses/responses';
import { ModelRunner, ChatModelParams, RunOutcome } from './runnables';
import {
  AssistantMessage,
  BaseMessage,
  TextPart,
  SystemMessage,
} from './messages';
import { ToolCall, Tool, toOpenAIToolSpec } from './tools';
import { StructuredOutputRunnable } from './structured_output_runnable';
import { logger } from '../../../utils/logger';

/**
 * Abstract base class for chat models, providing a common interface for
 * interacting with different LLM providers. It handles tool binding,
 * structured output, and the core logic of running a model.
 *
 * @example
 * ```typescript
 * class MyChatModel extends BaseChatModel {
 *   // Implementation details for a specific provider
 * }
 *
 * const model = new MyChatModel({ model: 'some-model' });
 * const result = await model.run([new UserMessage('Hello!')]);
 * console.log(result.assistant.content[0].text);
 * ```
 */
export abstract class BaseChatModel implements ModelRunner {
  protected abstract client: OpenAI;
  public params: ChatModelParams;
  protected boundTools?: Tool<any>[];
  protected structuredOutputSchema?: ZodType;

  constructor(params: ChatModelParams) {
    this.params = params;
  }

  /**
   * Binds tools to the model instance. When the model is run, it can then
   * choose to call any of the bound tools. This returns a new `BaseChatModel`
   * instance with the tools bound.
   *
   * @param tools An array of tools to bind to the model.
   * @returns A new `BaseChatModel` instance with the tools bound.
   *
   * @example
   * ```typescript
   * const model = new ChatOpenAI({ model: 'gpt-4' });
   * const modelWithTools = model.bind([weatherTool]);
   * const result = await modelWithTools.run(
   *   [new UserMessage('What is the weather in Paris?')]
   * );
   * // result.toolCalls will contain a call to the weatherTool
   * ```
   */
  bind(tools: Tool<any>[]): this {
    const newInstance = new (this.constructor as new (
      params: ChatModelParams
    ) => this)(this.params);
    newInstance.boundTools = tools;
    return newInstance;
  }

  /**
   * Chains the model with a Zod schema to produce structured, validated output.
   *
   * @param schema The Zod schema for the desired output format.
   * @returns A `StructuredOutputRunnable` instance that will return a typed object.
   *
   * @example
   * ```typescript
   * const schema = z.object({ name: z.string(), age: z.number() });
   * const structuredModel = model.withStructuredOutput(schema);
   *
   * const result = await structuredModel.run(
   *   [new UserMessage('Extract: John Doe is 30.')]
   * );
   * // result is a typed object: { name: 'John Doe', age: 30 }
   * ```
   */
  withStructuredOutput<T extends ZodType>(
    schema: T
  ): StructuredOutputRunnable<T> {
    const newInstance = this._clone();
    newInstance.structuredOutputSchema = schema;
    return new StructuredOutputRunnable(newInstance, schema);
  }

  /**
   * Runs the model with a given conversation history and returns the outcome.
   *
   * @param msgs The array of messages representing the conversation history.
   * @returns A promise that resolves to the outcome of the model run, including
   * the assistant's reply and any tool calls.
   *
   * @example
   * ```typescript
   * const result = await model.run(
   *   [
   *     new SystemMessage('You are a helpful assistant.'),
   *     new UserMessage('What is the capital of France?'),
   *   ]
   * );
   * console.log(result.assistant.content[0].text); // "Paris"
   * ```
   */
  async run(systemPrompt: SystemMessage, msgs: BaseMessage[]): Promise<RunOutcome> {
    const params = this._buildParams(systemPrompt, msgs);
    
    logger.debug(
      { model: this.params.model, messageCount: msgs.length },
      '[BaseChatModel] Making API call'
    );
    
    const response = await this.client.responses.create(
      params as ResponseCreateParamsNonStreaming
    );
    
    logger.debug(
      { model: this.params.model, response },
      '[BaseChatModel] API call completed'
    );

    const { assistantContent, toolCalls, rawToolCalls } =
      this._processResponse(response);

    const assistant = new AssistantMessage(assistantContent);
    assistant.meta = {
      raw: response,
      tool_calls: toolCalls,
      raw_tool_calls: rawToolCalls,
    };

    return {
      assistant,
      toolCalls,
      raw: response,
    };
  }

  /**
   * Builds the API-compatible parameters for the `client.responses.create` call.
   * This method serializes the `BaseMessage[]` array and combines it with
   * model parameters and tool definitions.
   *
   * @param msgs The array of messages to be serialized.
   * @returns The parameters object for the API call.
   * @protected
   */
  protected _buildParams(
    systemPrompt: SystemMessage,
    msgs: BaseMessage[],
  ): ResponseCreateParamsNonStreaming {
    const instructions = systemPrompt.content
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join('');

    const input: ResponseInputItem[] = msgs.flatMap(m => {
      if (m.role === 'tool') {
        return {
          type: 'function_call_output',
          call_id: m.tool_call_id!,
          output: m.content
            .filter((p): p is TextPart => p.type === 'text')
            .map(p => p.text)
            .join(''),
        };
      }

      if (m.role === 'assistant') {
        const items: ResponseInputItem[] = [];
        const textContent = m.content
          .filter((p): p is TextPart => p.type === 'text')
          .map(p => p.text)
          .join('')
          .trim();

        if (textContent) {
          items.push({
            role: 'assistant',
            content: textContent,
          });
        }

        const rawToolCalls = m.meta?.raw_tool_calls as
          | ResponseFunctionToolCall[]
          | undefined;
        if (rawToolCalls?.length) {
          items.push(...rawToolCalls);
        }
        return items;
      }

      // User messages
      return {
        role: 'user',
        content: m.content.map(c => {
          if (c.type === 'text') {
            return { type: 'input_text' as const, text: c.text };
          }
          // ImagePart
          return {
            type: 'input_image' as const,
            image_url: c.image_url.url,
            detail: c.image_url.detail || 'auto',
          };
        }),
      };
    });

    const tools = this.boundTools?.map(toOpenAIToolSpec);

    const params: ResponseCreateParamsNonStreaming = {
      model: this.params.model,
      input,
      temperature: this.params.temperature,
      max_output_tokens: this.params.maxTokens,
      top_p: this.params.topP,
      stream: false,
    };

    if (instructions) {
      params.instructions = instructions;
    }

    if (this.params.reasoning) {
      params.reasoning = this.params.reasoning;
    }

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = 'auto';
    }

    if (this.structuredOutputSchema) {
      const toolName = 'structured_output';
      const tool: FunctionTool = {
        type: 'function',
        name: toolName,
        description: 'Structured output formatter',
        parameters: z.toJSONSchema(this.structuredOutputSchema),
        strict: true,
      };
      params.tools = [...(params.tools || []), tool];
      params.tool_choice = {
        type: 'function',
        name: toolName,
      };
    }

    return params;
  }

  protected _clone(): this {
    const newInstance = new (this.constructor as new (
      params: ChatModelParams
    ) => this)(this.params);
    newInstance.boundTools = this.boundTools;
    newInstance.structuredOutputSchema = this.structuredOutputSchema;
    return newInstance;
  }

  /**
   * Processes the raw response from the LLM provider's API.
   * It extracts the assistant's text content and parses any tool calls.
   *
   * @param response The raw response object from the provider.
   * @returns An object containing the assistant's content and parsed tool calls.
   * @protected
   */
  protected _processResponse(
    response: Response
  ): {
    assistantContent: string;
    toolCalls?: ToolCall[];
    rawToolCalls?: ResponseFunctionToolCall[];
  } {
    const assistantContent: string = response.output_text ?? '';
    const output: ResponseOutputItem[] = response.output ?? [];

    const rawToolCalls = output.filter(
      (item): item is ResponseFunctionToolCall => item?.type === 'function_call'
    );

    const toolCalls: ToolCall[] = rawToolCalls.map(item => {
      try {
        return {
          id: item.call_id,
          name: item.name,
          arguments: item.arguments ? JSON.parse(item.arguments) : {},
        };
      } catch (e) {
        throw new Error(`Failed to parse arguments for ${item.name}: ${e}`);
      }
    });

    return {
      assistantContent,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      rawToolCalls: rawToolCalls.length ? rawToolCalls : undefined,
    };
  }
}
