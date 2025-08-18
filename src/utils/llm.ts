import { ChatOpenAI } from '@langchain/openai';

/**
 * Provides standardized ChatOpenAI clients for text and vision tasks.
 */
export function getNanoLLM(): ChatOpenAI {
  return new ChatOpenAI({ model: 'gpt-5-nano', useResponsesApi: true, reasoning: { effort: 'minimal' } });
}

export function getVisionLLM(): ChatOpenAI {
  return new ChatOpenAI({ model: 'gpt-5', useResponsesApi: true, reasoning: { effort: 'minimal' } });
}


