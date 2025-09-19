import { promises as fsp } from 'fs';
import path from 'path';

import { InternalServerError } from './errors';

/**
 * Loads a prompt template from prompts directory by filename.
 * @param filename The name of the prompt file.
 */
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
