import { ChatOpenAI } from '@langchain/openai';
import { getLogger } from '../utils/logger';
import { ChatGroq } from '@langchain/groq';
const logger = getLogger('service:openai');

let textLLM: ChatGroq | null = null;
let visionLLM: ChatOpenAI | null = null;

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

