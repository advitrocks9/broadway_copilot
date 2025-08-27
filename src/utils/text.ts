/**
 * Text utilities for normalization and comparison.
 */

/**
 * Normalizes whitespace by collapsing multiple spaces and trimming.
 */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Converts text to lowercase with normalized whitespace.
 */
export function toNameLower(input: string): string {
  return normalizeWhitespace(input).toLowerCase();
}

/**
 * Sanitizes a WhatsApp ID for safe filesystem usage by replacing non-word characters with underscores.
 */
export function sanitizeWaIdForFilesystem(waId: string): string {
  return waId.replace(/[^\w+]/g, '_');
}
