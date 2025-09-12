import { ZodType } from 'zod';
import {
  BaseMessage,
  ToolMessage,
  SystemMessage,
} from '../core/messages';
import { Tool } from '../core/tools';
import { BaseChatModel } from '../core/base_chat_model';
import { logger } from '../../../utils/logger';

const MAX_ITERATIONS = 5;

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
 * const weatherTool: Tool<{ location: string }> = {
 *   name: 'get_weather',
 *   description: 'Get weather for a location',
 *   schema: z.object({ location: z.string() }),
 *   func: async ({ location }) => `The weather in ${location} is sunny.`,
 * };
 *
 * const output = await agentExecutor(
 *   model,
 *   'You are a helpful weather assistant.',
 *   [new UserMessage('What is the weather in New York?')],
 *   {
 *     tools: [weatherTool],
 *     outputSchema: z.object({ weather: z.string() })
 *   }
 * );
 *
 * // output.weather might be: "The weather in New York is sunny."
 * ```
 */
export async function agentExecutor<T extends ZodType>(
  runner: BaseChatModel,
  systemPrompt: SystemMessage,
  history: BaseMessage[],
  options: { tools: Tool<any>[]; outputSchema: T },
  maxLoops: number = MAX_ITERATIONS,
): Promise<T['_output']> {
  logger.debug(
    { toolCount: options.tools.length, maxLoops },
    '[AgentExecutor] Starting',
  );
  
  const runnerWithTools = runner.bind(options.tools);

  const conversation: BaseMessage[] = [...history];

  const seenToolCallIds = new Set<string>();

  for (let i = 0; i < maxLoops; i++) {
    logger.debug({ loop: i + 1, maxLoops }, '[AgentExecutor] Loop');
    const { assistant, toolCalls } = await runnerWithTools.run(
      systemPrompt,
      conversation,
    );

    logger.debug(
      { toolCallCount: toolCalls?.length || 0 },
      '[AgentExecutor] Received tool calls',
    );
    
    conversation.push(assistant);

    if (!toolCalls || toolCalls.length === 0) {
      logger.debug(
        '[AgentExecutor] No tool calls, generating final structured output',
      );
      const structuredRunner = runner.withStructuredOutput(options.outputSchema);
      return await structuredRunner.run(systemPrompt, conversation);
    }

    // Filter out tool calls that have already been executed
    const newToolCalls = toolCalls.filter(
      toolCall => !seenToolCallIds.has(toolCall.id),
    );

    // Mark new tool calls as seen
    newToolCalls.forEach(toolCall => seenToolCallIds.add(toolCall.id));

    if (newToolCalls.length === 0) {
      const structuredRunner = runner.withStructuredOutput(options.outputSchema);
      return await structuredRunner.run(systemPrompt, conversation);
    }

    const toolResults = await Promise.all(
      newToolCalls.map(async toolCall => {
        const toolDef = options.tools.find(t => t.name === toolCall.name);
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
          logger.error(
            { err: error, toolName: toolCall.name },
            'Error executing tool',
          );
          return {
            id: toolCall.id,
            name: toolCall.name,
            result: `Error executing tool '${toolCall.name}': ${
              error instanceof Error ? error.message : String(error)
            }`,
            isError: true,
          };
        }
      })
    );

    toolResults.forEach(toolResult => {
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

  const structuredRunner = runner.withStructuredOutput(options.outputSchema);
  return await structuredRunner.run(systemPrompt, conversation);
}
