import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import {
  AIMessage,
  type BaseMessage,
  SystemMessage,
  HumanMessage,
} from '@langchain/core/messages';
import { type Tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

import { logger } from '../utils/logger';

/**
 * Cached LLM instances for different use cases.
 * Uses singleton pattern to avoid recreating expensive LLM instances.
 */
let textLLM: ChatGroq | null = null;
let visionLLM: ChatOpenAI | null = null;

/**
 * Gets or creates a cached text-only LLM instance using Groq API.
 * Uses OpenAI GPT-OSS-120B model optimized for conversational tasks.
 *
 * @returns Cached ChatGroq instance for text processing
 */
export function getTextLLM(): ChatGroq {
  if (!textLLM) {
    logger.info('Initializing Text LLM (gpt-oss-120b)');
    textLLM = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-120b',
    });
  }
  return textLLM;
}

/**
 * Gets or creates a cached vision-capable LLM instance using OpenAI API.
 * Uses GPT-5-mini model optimized for image analysis and multimodal tasks.
 *
 * @returns Cached ChatOpenAI instance for vision processing
 */
export function getVisionLLM(): ChatOpenAI {
  if (!visionLLM) {
    logger.info('Initializing Vision LLM (gpt-5)');
    visionLLM = new ChatOpenAI({
      model: 'gpt-5-mini',
      useResponsesApi: true,
      reasoning: { effort: 'minimal' }
    });
  }
  return visionLLM;
}

/**
 * Invokes the text LLM with a structured output schema.
 * Handles type casting and simplifies calls in node functions.
 *
 * @param prompt - The prompt to send to the LLM (string or message array).
 * @param schema - The Zod schema for the expected JSON output.
 * @returns A promise that resolves to the parsed output object.
 */
export async function invokeTextLLMWithJsonOutput<T extends z.ZodType<any, any, any>>(
  prompt: string | BaseMessage[],
  schema: T,
): Promise<z.infer<T>> {
  // This is a patch for Groq models. Sometimes, they return raw JSON
  // instead of calling the tool LangChain expects for structured output,
  // which causes parsing errors. This instruction forces the model to use the tool.
  const instruction = `\n\nYou MUST use the "extract" tool to provide your answer.`;
  let finalPrompt: string | BaseMessage[];

  if (typeof prompt === 'string') {
    finalPrompt = prompt + instruction;
  } else {
    const messages = [...prompt];
    const systemMessageIndex = messages.findIndex(
      (m) => m.getType() === 'system',
    );

    if (systemMessageIndex !== -1) {
      const originalSystemMessage = messages[systemMessageIndex];
      const newContent = `${originalSystemMessage.content}${instruction}`;
      messages[systemMessageIndex] = new SystemMessage(
        newContent,
        originalSystemMessage.additional_kwargs,
      );
    } else {
      // Fallback: if no system message, just prepend one. This is unlikely given the codebase structure.
      messages.unshift(new SystemMessage(instruction.trim()));
    }
    finalPrompt = messages;
  }

  const llm = getTextLLM().withStructuredOutput(schema);
  return llm.invoke(finalPrompt) as Promise<z.infer<T>>;
}

/**
 * Invokes the vision LLM with a structured output schema.
 * Handles type casting and simplifies calls in node functions.
 *
 * @param prompt - The prompt to send to the LLM (string or message array).
 * @param schema - The Zod schema for the expected JSON output.
 * @returns A promise that resolves to the parsed output object.
 */
export async function invokeVisionLLMWithJsonOutput<T extends z.ZodType<any, any, any>>(
  prompt: string | BaseMessage[],
  schema: T,
): Promise<z.infer<T>> {
  const llm = getVisionLLM().withStructuredOutput(schema);
  return llm.invoke(prompt) as Promise<z.infer<T>>;
}

/**
 * Creates a fallback response when structured output is not available.
 *
 * @param content - Fallback text content
 * @returns Fallback response object
 */
function fallbackResponse(content: any) {
  if (typeof content === 'string' && content) {
    return {
      message1_text: content,
      message2_text: null,
    };
  }

  logger.error('Could not generate valid fallback response');
  return {
    message1_text: "Sorry, I'm having trouble understanding. Can you rephrase?",
    message2_text: null,
  };
}


/**
 * Extracts the final structured response from agent messages.
 * It tries to parse JSON directly from the last message content. If that fails,
 * it uses a fallback LLM to clean up and extract the JSON.
 *
 * @param messages - Array of messages from agent invocation
 * @param schema - Zod schema for validating the output
 * @returns Parsed final response object
 */
export async function extractFinalResponse<T extends z.ZodObject<any>>(
  messages: BaseMessage[],
  schema: T,
): Promise<z.infer<T>> {
  const lastMessage = messages.at(-1);
  if (
    !lastMessage ||
    !(lastMessage instanceof AIMessage) ||
    typeof lastMessage.content !== 'string' ||
    !lastMessage.content
  ) {
    logger.warn('Last message is not a valid AI message, using fallback');
    return fallbackResponse(lastMessage?.content) as z.infer<T>;
  }

  const { content } = lastMessage;

  try {
    const jsonStartIndex = content.indexOf('{');
    const jsonEndIndex = content.lastIndexOf('}');
    if (jsonStartIndex === -1 || jsonEndIndex === -1) {
      throw new Error('No JSON object found in the content.');
    }
    const jsonString = content.substring(jsonStartIndex, jsonEndIndex + 1);
    const parsedJson = JSON.parse(jsonString);
    return schema.parse(parsedJson);
  } catch (error) {
    logger.warn(
      { error, content },
      'Failed to parse agent output directly, trying fallback LLM',
    );

    const fallbackSystemPrompt = `You are a helpful assistant that extracts JSON from text. A user will provide text that is supposed to be a JSON object but is malformed. Your task is to correct any syntax errors and return only the valid JSON object. Do not add any extra text or explanations. Do not alter the data within the JSON.`;
    const userMessage = `You are given text, extract the JSON and return it. Don't change anything about it. The text is:\n\n${content}`;

    const fallbackMessages: BaseMessage[] = [
      new SystemMessage(fallbackSystemPrompt),
      new HumanMessage(userMessage),
    ];

    try {
      const cleanedJson = await invokeTextLLMWithJsonOutput(
        fallbackMessages,
        schema,
      );
      return cleanedJson;
    } catch (fallbackError) {
      logger.error(
        { fallbackError, content },
        'Fallback LLM also failed to extract JSON.',
      );
      return fallbackResponse(content) as z.infer<T>;
    }
  }
}

/**
 * Creates and invokes a ReAct agent to handle complex conversational tasks.
 *
 * @param additionalTools - An array of tools for the agent to use.
 * @param systemPrompt - The system prompt string.
 * @param history - The conversation history.
 * @param outputSchema - The Zod schema for the final output.
 * @returns The parsed final response from the agent.
 */
export async function invokeAgent<T extends z.ZodObject<any>>(
  additionalTools: (Tool | DynamicStructuredTool)[],
  systemPrompt: string,
  history: BaseMessage[],
  outputSchema: T,
): Promise<z.infer<T>> {
  const llm = getTextLLM();

  const tools = [...additionalTools];

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    new MessagesPlaceholder('messages'),
  ]);

  const agent = createReactAgent({ llm, tools, prompt });

  const agentResult = await agent.invoke({
    messages: history,
  });

  return extractFinalResponse(agentResult.messages, outputSchema);
}

