import { promises as fsp } from 'fs';
import path from 'path';
import { getLogger } from './logger';

const logger = getLogger('utils:prompts');

/**
 * Loads a prompt template from prompts directory by filename.
 */
export async function loadPrompt(filename: string): Promise<string> {
  const promptPath = path.resolve(process.cwd(), 'prompts', filename);
  logger.debug({ filename, promptPath }, 'Loading prompt template');

  try {
    const content = await fsp.readFile(promptPath, 'utf-8');
    logger.debug({ filename, contentLength: content.length }, 'Prompt template loaded successfully');
    return content;
  } catch (err: any) {
    logger.error({ filename, promptPath, err: err.message }, 'Failed to load prompt template');
    throw new Error(`Prompt file not found or unreadable: ${promptPath}`);
  }
}