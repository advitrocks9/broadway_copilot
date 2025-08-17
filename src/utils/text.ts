export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function toNameLower(input: string): string {
  return normalizeWhitespace(input).toLowerCase();
}

export function includesKeyword(text: string, regex: RegExp): boolean {
  return regex.test(text);
}

export function formatColorReplySummary(args: {
  skin_tone?: string;
  eye_color?: string;
  hair_color?: string;
  top3_colors: string[];
  avoid3_colors: string[];
}): string {
  const parts: string[] = [];
  if (args.skin_tone) parts.push(`Skin: ${args.skin_tone}`);
  if (args.eye_color) parts.push(`Eyes: ${args.eye_color}`);
  if (args.hair_color) parts.push(`Hair: ${args.hair_color}`);
  parts.push(`Top colors: ${args.top3_colors.slice(0, 3).join(', ')}`);
  parts.push(`Avoid: ${args.avoid3_colors.slice(0, 3).join(', ')}`);
  return parts.join('. ') + '.';
}
