import type { MessageContent, MessageContentPart } from '../lib/ai';

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
}
