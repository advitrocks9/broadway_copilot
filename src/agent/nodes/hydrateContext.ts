import { RunInput } from '../state';
import { fetchRecentTurns, queryWardrobe, queryColors } from '../tools';

type HydrateIn = { input: RunInput };

export async function hydrateContextNode(state: HydrateIn): Promise<{ messages: unknown[]; wardrobe: unknown; latestColorAnalysis: unknown }>{
  const { input } = state;
  const [messages, wardrobe, colors] = await Promise.all([
    fetchRecentTurns(input.userId, 12),
    queryWardrobe(input.userId),
    queryColors(input.userId),
  ]);
  return { messages, wardrobe, latestColorAnalysis: colors.latestColorAnalysis };
}


