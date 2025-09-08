import { promises as fsp } from 'fs';
import path from 'path';
import { getLogger } from './logger';

const logger = getLogger('utils:prompts');

let personaPrompt: string | null = null;

/**
 * Loads the persona prompt from the filesystem and caches it.
 */
async function loadPersonaPrompt(): Promise<string> {
  if (personaPrompt) {
    return personaPrompt;
  }
  const personaPath = path.resolve(process.cwd(), 'prompts', 'persona.txt');
  try {
    const content = await fsp.readFile(personaPath, 'utf-8');
    personaPrompt = content;
    return personaPrompt;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to load persona.txt');
    throw new Error('persona.txt not found or unreadable');
  }
}

/**
 * Loads a prompt template from prompts directory by filename.
 * @param filename The name of the prompt file.
 * @param options Options for loading the prompt.
 * @param options.injectPersona Whether to inject the persona at the top.
 */
export async function loadPrompt(
  filename: string,
  options: { injectPersona?: boolean } = {},
): Promise<string> {
  const promptPath = path.resolve(process.cwd(), 'prompts', filename);
  logger.debug({ filename, promptPath, options }, 'Loading prompt template');

  try {
    const content = await fsp.readFile(promptPath, 'utf-8');
    logger.debug({ filename, contentLength: content.length }, 'Prompt template loaded successfully');

    if (options.injectPersona) {
      const persona = await loadPersonaPrompt();
      return `${persona}\n\n${content}`;
    }

    return content;
  } catch (err: any) {
    logger.error({ filename, promptPath, err: err.message }, 'Failed to load prompt template');
    throw new Error(`Prompt file not found or unreadable: ${promptPath}`);
  }
}