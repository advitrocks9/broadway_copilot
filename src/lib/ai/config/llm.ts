import { ChatGroq } from '../groq/chat_models';
import { ChatOpenAI } from '../openai/chat_models';

let textLLM: ChatGroq | null = null;
let visionLLM: ChatOpenAI | null = null;

export function getTextLLM(): ChatGroq {
  if (!textLLM) {
    textLLM = new ChatGroq({
      model: 'llama-3.3-70b-versatile',
    });
  }
  return textLLM;
}

export function getVisionLLM(): ChatOpenAI {
  if (!visionLLM) {
    visionLLM = new ChatOpenAI({
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
    });
  }
  return visionLLM;
}
