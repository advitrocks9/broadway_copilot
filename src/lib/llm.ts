import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';

import { logger }  from '../utils/logger';

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

