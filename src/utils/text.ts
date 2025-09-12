/**
 * Text utilities for normalization and comparison.
 */

import type { MessageContent, MessageContentPart } from '../lib/ai';

/**
 * Extracts text content from message content array, replacing images with [IMAGE] placeholders.
 * Handles both structured message content arrays and plain text strings.
 *
 * @param content - Message content from LangChain (array of parts or plain string)
 * @returns Extracted text with image placeholders for multimodal content
 */
export function extractTextContent(content: MessageContent | string): string {
  if (Array.isArray(content)) {
    return content
      .map((part: MessageContentPart) => {
        if (part.type === 'image_url') {
          return '[IMAGE]';
        } else if (part.type === 'text') {
          return part.text;
        }
        return '';
      })
      .join(' ');
  }
  return content as string;
  
}/**
 * Calculates cosine similarity between two vectors.
 * Used for ranking memory relevance based on semantic similarity.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between 0 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

