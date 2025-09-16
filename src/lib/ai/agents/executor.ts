import { ZodType } from "zod";
import {
  BaseMessage,
  ToolMessage,
  SystemMessage,
  AssistantMessage,
  UserMessage,
  TextPart,
} from "../core/messages";
import { Tool } from "../core/tools";
import { BaseChatModel } from "../core/base_chat_model";
import { TraceBuffer } from "../../../agent/tracing";

const MAX_ITERATIONS = 5;

/**
 * Parses the final assistant message into a structured JSON output.
 * It takes the last message, if it's from the assistant, and asks the model
 * to format it into the desired schema with a specific, direct prompt.
 *
 * @param runner The chat model instance.
 * @param conversation The full conversation history.
 * @param outputSchema The Zod schema for the final output.
 * @returns A promise that resolves to the structured output.
 */
async function getFinalStructuredOutput<T extends ZodType>(
  runner: BaseChatModel,
  conversation: BaseMessage[],
  outputSchema: T,
  traceBuffer: TraceBuffer,
  nodeName?: string,
): Promise<T["_output"]> {
  const lastMessage = conversation[conversation.length - 1];

  // If the last message is an assistant's message, use it for parsing.
  if (lastMessage instanceof AssistantMessage) {
    const customPrompt = new SystemMessage(
      "Parse the user message which contains the output from a previous step into a JSON object " +
        "that strictly adheres to the provided schema. " +
        "Do not add any extra commentary or change any of the values.",
    );

    const textContent = lastMessage.content
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("");

    const parsingConversation: BaseMessage[] = [new UserMessage(textContent)];

    const structuredRunner = runner.withStructuredOutput(outputSchema);
    return await structuredRunner.run(
      customPrompt,
      parsingConversation,
      traceBuffer,
      nodeName,
    );
  } else {
    throw new Error("Last message is not an assistant message");
  }
}

/**
 * Orchestrates an agentic loop of model calls and tool executions to fulfill a user request.
 * The executor manages the conversation history, calls tools when requested by the model,
 * and feeds the results back to the model until a final answer is generated.
 *
 * @param runner The chat model instance to use.
 * @param systemPrompt A guiding prompt for the agent's persona and objective.
 * @param history The initial conversation history, typically starting with a user message.
 * @param options An object containing the list of available `tools` and a Zod `outputSchema`.
 * @param maxLoops The maximum number of tool-call iterations before stopping. Defaults to 5.
 * @returns A promise that resolves to the structured output.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { Tool } from '../core/tools';
 * import { ChatOpenAI } from '../openai/chat_models';
 *
 * const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
 * const weatherTool = new Tool({
 *   name: 'get_weather',
 *   description: 'Get weather for a location',
 *   schema: z.object({ location: z.string() }),
 *   func: async ({ location }) => `The weather in ${location} is sunny.`,
 * });
 *
 * const output = await agentExecutor(
 *   model,
 *   new SystemMessage('You are a helpful weather assistant.'),
 *   [new UserMessage('What is the weather in New York?')],
 *   {
 *     tools: [weatherTool],
 *     outputSchema: z.object({ weather: z.string() })
 *   },
 *   'some-graph-run-id'
 * );
 *
 * // output.weather might be: "The weather in New York is sunny."
 * ```
 */
export async function agentExecutor<T extends ZodType>(
  runner: BaseChatModel,
  systemPrompt: SystemMessage,
  history: BaseMessage[],
  options: {
    tools: Tool<any>[];
    outputSchema: T;
    nodeName?: string;
  },
  traceBuffer: TraceBuffer,
  maxLoops: number = MAX_ITERATIONS,
): Promise<T["_output"]> {
  const runnerWithTools = runner.bind(options.tools);

  const conversation: BaseMessage[] = [...history];

  const seenToolCallIds = new Set<string>();

  for (let i = 0; i < maxLoops; i++) {
    const { assistant, toolCalls } = await runnerWithTools.run(
      systemPrompt,
      conversation,
      traceBuffer,
      options.nodeName,
    );

    conversation.push(assistant);

    if (!toolCalls || toolCalls.length === 0) {
      break;
    }

    const toolResults = await Promise.all(
      toolCalls
        .filter((toolCall) => !seenToolCallIds.has(toolCall.id))
        .map(async (toolCall) => {
          seenToolCallIds.add(toolCall.id);
          const toolDef = options.tools.find((t) => t.name === toolCall.name);
          if (!toolDef) {
            return {
              id: toolCall.id,
              name: toolCall.name,
              result: `Tool '${toolCall.name}' not found.`,
              isError: true,
            };
          }
          try {
            const parsedArgs = toolDef.schema.parse(toolCall.arguments);
            const result = await Promise.resolve(toolDef.func(parsedArgs));
            return {
              id: toolCall.id,
              name: toolDef.name,
              result,
              isError: false,
            };
          } catch (error) {
            return {
              id: toolCall.id,
              name: toolCall.name,
              result: `Error executing tool '${toolCall.name}': ${
                error instanceof Error ? error.message : String(error)
              }`,
              isError: true,
            };
          }
        }),
    );

    if (toolResults.length === 0) {
      break;
    }

    toolResults.forEach((toolResult) => {
      conversation.push(
        new ToolMessage(
          JSON.stringify(toolResult.result, null, 2),
          toolResult.id,
          toolResult.name,
          toolResult.isError,
        ),
      );
    });
  }

  return await getFinalStructuredOutput(
    runner,
    conversation,
    options.outputSchema,
    traceBuffer,
    options.nodeName,
  );
}
