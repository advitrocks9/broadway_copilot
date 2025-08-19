export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function toNameLower(input: string): string {
  return normalizeWhitespace(input).toLowerCase();
}

