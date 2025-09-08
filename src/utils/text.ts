/**
 * Text utilities for normalization and comparison.
 */

/**
 * Normalizes whitespace by collapsing multiple spaces and trimming.
 */
function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Converts text to lowercase with normalized whitespace.
 */
export function toNameLower(input: string): string {
  return normalizeWhitespace(input).toLowerCase();
}
