import { ChatOpenAI } from "../openai/chat_models";
import { ChatGroq } from "../groq/chat_models";

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
    textLLM = new ChatGroq({
      model: "llama-3.3-70b-versatile",
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
    visionLLM = new ChatOpenAI({
      model: "gpt-5-mini",
      reasoning: { effort: "minimal" },
    });
  }
  return visionLLM;
}
