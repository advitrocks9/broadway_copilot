import { describe, expect, it } from 'vitest';
import { extractTextContent } from '../../src/utils/text';

describe('extractTextContent', () => {
  it('returns a plain string as-is', () => {
    expect(extractTextContent('hello world')).toBe('hello world');
  });

  it('extracts text from a text-only content array', () => {
    const content = [{ type: 'text' as const, text: 'Hello' }];
    expect(extractTextContent(content)).toBe('Hello');
  });

  it('replaces image parts with [IMAGE] placeholder', () => {
    const content = [
      { type: 'image_url' as const, image_url: { url: 'https://example.com/img.jpg' } },
    ];
    expect(extractTextContent(content)).toBe('[IMAGE]');
  });

  it('handles mixed text and image content', () => {
    const content = [
      { type: 'text' as const, text: 'Check this out' },
      { type: 'image_url' as const, image_url: { url: 'https://example.com/img.jpg' } },
      { type: 'text' as const, text: 'What do you think?' },
    ];
    expect(extractTextContent(content)).toBe('Check this out [IMAGE] What do you think?');
  });

  it('handles an empty content array', () => {
    expect(extractTextContent([])).toBe('');
  });
});
