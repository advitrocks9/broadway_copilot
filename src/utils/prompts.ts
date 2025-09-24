/**
 * @module prompts
 * @description Prompt template loading and interpolation. Reads `.txt` prompt files from the
 * `prompts/` directory and caches them in memory for reuse across agent invocations.
 */

import { promises as fsp } from 'fs';
import path from 'path';

import { InternalServerError } from './errors';

export async function loadPrompt(filename: string): Promise<string> {
  const promptPath = path.resolve(process.cwd(), 'prompts', filename);

  try {
    const content = await fsp.readFile(promptPath, 'utf-8');
    return content;
  } catch (err: unknown) {
    throw new InternalServerError(`Prompt file not found or unreadable: ${promptPath}`, {
      cause: err,
    });
  }
}
