/**
 * Text utilities for normalization and comparison.
 */

import type { MessageContent } from '@langchain/core/messages';

/**
 * Extracts text content from message content array, replacing images with [IMAGE] placeholders.
 * Handles both structured message content arrays and plain text strings.
 *
 * @param content - Message content from LangChain (array of parts or plain string)
 * @returns Extracted text with image placeholders for multimodal content
 */
export function extractTextContent(content: MessageContent): string {
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
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
}
