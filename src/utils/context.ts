import { AdditionalContextItem } from '../agent/state';

type Section = { role: 'user'; content: string };

/**
 * Builds prompt sections for additional context items requested by the router.
 * Includes WardrobeContext and LatestColorAnalysis only when specified.
 */
export function buildAdditionalContextSections(state: {
  wardrobe?: unknown;
  latestColorAnalysis?: unknown;
  additionalContext?: AdditionalContextItem[];
}): Section[] {
  const sections: Section[] = [];
  const requested = Array.isArray(state.additionalContext) ? state.additionalContext : [];
  if (requested.includes('wardrobeItems')) {
    sections.push({ role: 'user', content: `WardrobeContext: ${JSON.stringify(state.wardrobe || {})}` });
  }
  if (requested.includes('latestColorAnalysis')) {
    sections.push({ role: 'user', content: `LatestColorAnalysis: ${JSON.stringify(state.latestColorAnalysis || null)}` });
  }
  return sections;
}


