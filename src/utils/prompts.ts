import fs from 'fs';
import path from 'path';

export function loadPrompt(filename: string): string {
  const promptPath = path.resolve(process.cwd(), 'src', 'prompts', filename);
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    throw new Error(`Prompt file not found or unreadable: ${promptPath}`);
  }
}


