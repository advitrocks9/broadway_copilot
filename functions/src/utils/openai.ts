import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  dimensions: number;
};

export type TextContentPart = {
  type: 'text';
  text: string;
};

export const isTextContentPart = (part: unknown): part is TextContentPart =>
  typeof part === 'object' && 
  part !== null && 
  'type' in part && 
  part.type === 'text' && 
  'text' in part && 
  typeof (part as any).text === 'string';

export async function getEmbedding(input: string): Promise<EmbeddingResult> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('Failed to generate embedding');
  }

  return {
    embedding,
    model: EMBEDDING_MODEL,
    dimensions: embedding.length,
  };
}

export type ContentPart = 
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' };

export type VisionMessage = {
  role: 'user' | 'system';
  content: ContentPart[];
};

/** Generates structured JSON from vision model using custom responses API */
export async function generateJson<T>(
  model: string,
  messages: VisionMessage[]
): Promise<T> {
  const response = await (openai as any).responses.create({
    model,
    input: messages,
  });

  const text = response.output_text;
  if (!text) {
    throw new Error('No response text from AI');
  }

  return JSON.parse(text);
}


