import { RunInput } from '../state';
import { fetchRecentTurns, queryWardrobe, queryColors } from '../tools';

type HydrateIn = { input: RunInput };

/**
 * Hydrates state with recent messages, wardrobe items, and latest color analysis.
 */
export async function hydrateContextNode(state: HydrateIn): Promise<{ messages: unknown[]; wardrobe: unknown; latestColorAnalysis: unknown }>{
  const { input } = state;
  const [messages, wardrobe, colors] = await Promise.all([
    fetchRecentTurns(input.userId, 6),
    queryWardrobe(input.userId),
    queryColors(input.userId),
  ]);
  return { messages, wardrobe, latestColorAnalysis: colors.latestColorAnalysis };
}


