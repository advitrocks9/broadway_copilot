import { RunInput } from '../state';
import { fetchRecentTurns, queryWardrobe, queryColors } from '../tools';

/**
 * Hydrates state with recent messages, wardrobe items, and latest color analysis.
 */
interface HydrateContextState {
  input: RunInput;
}

interface HydrateContextResult {
  messages: unknown[];
  wardrobe: unknown;
  latestColorAnalysis: unknown;
}

export async function hydrateContextNode(state: HydrateContextState): Promise<HydrateContextResult> {
  const { input } = state;
  const [messages, wardrobe, colors] = await Promise.all([
    fetchRecentTurns(input.userId, 6),
    queryWardrobe(input.userId),
    queryColors(input.userId),
  ]);
  return { messages, wardrobe, latestColorAnalysis: colors.latestColorAnalysis };
}


