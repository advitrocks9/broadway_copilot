import { promises as fsp } from 'fs';
import path from 'path';

/**
 * Loads a prompt template from prompts directory by filename.
 */
export async function loadPrompt(filename: string): Promise<string> {
  const promptPath = path.resolve(process.cwd(), 'prompts', filename);
  try {
    return await fsp.readFile(promptPath, 'utf-8');
  } catch (err) {
    throw new Error(`Prompt file not found or unreadable: ${promptPath}`);
  }
}


