import { ZodType } from 'zod';
import { TraceBuffer } from '../../../agent/tracing';
import { BaseChatModel } from '../core/base_chat_model';
import {
  AssistantMessage,
  BaseMessage,
  SystemMessage,
  TextPart,
  ToolMessage,
  UserMessage,
} from '../core/messages';
import { Tool } from '../core/tools';

const MAX_ITERATIONS = 5;

async function getFinalStructuredOutput<T extends ZodType>(
  runner: BaseChatModel,
  conversation: BaseMessage[],
  outputSchema: T,
  traceBuffer: TraceBuffer,
  nodeName: string,
): Promise<T['_output']> {
  const lastMessage = conversation[conversation.length - 1];

  if (lastMessage instanceof AssistantMessage) {
    const customPrompt = new SystemMessage(
      'Parse the user message which contains the output from a previous step into a JSON object ' +
        'that strictly adheres to the provided schema. ' +
        'Do not add any extra commentary or change any of the values.',
    );

    const textContent = lastMessage.content
      .filter((p): p is TextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');

    const parsingConversation: BaseMessage[] = [new UserMessage(textContent)];

    const structuredRunner = runner.withStructuredOutput(outputSchema);
    return await structuredRunner.run(customPrompt, parsingConversation, traceBuffer, nodeName);
  } else {
    throw new Error('Last message is not an assistant message');
  }
}

/** Runs an agentic tool-calling loop, then parses the final response into structured output. */
export async function agentExecutor<T extends ZodType>(
  runner: BaseChatModel,
  systemPrompt: SystemMessage,
  history: BaseMessage[],
  options: {
    tools: Tool[];
    outputSchema: T;
    nodeName: string;
  },
  traceBuffer: TraceBuffer,
  maxLoops: number = MAX_ITERATIONS,
): Promise<T['_output']> {
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

    if (toolCalls.length === 0) {
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
