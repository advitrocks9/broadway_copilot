export type Item = {
  name: string;
  description: string;
  category:
    | "TOP"
    | "BOTTOM"
    | "ONE_PIECE"
    | "OUTERWEAR"
    | "SHOES"
    | "BAG"
    | "ACCESSORY";
  type: string;
  subtype: string | null;
  mainColor: string;
  secondaryColor: string | null;
  attributes: {
    style?: string;
    pattern?: string;
    material?: string;
    fit?: string | null;
    length?: string | null;
    details?: string;
    keywords?: string[];
    occasion?: string;
    season?: string;
  };
};

const normalize = (text?: string | null): string => {
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
};

const categoryToken = (category: Item["category"]): string =>
  category.toLowerCase().replace("_", "-");

const splitDetails = (details?: string): string[] => {
  const text = normalize(details);
  if (!text) return [];

  return text
    .split(",")
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .flatMap((phrase) => {
      const words = phrase.split(" ").filter(Boolean);
      // Keep phrase and individual words for short phrases
      return words.length <= 3 ? [phrase, ...words] : [phrase];
    })
    .slice(0, 6); // Limit detail tokens
};

export const buildKeywords = (item: Item, maxLen = 12): string[] => {
  const {
    type,
    subtype,
    category,
    mainColor,
    secondaryColor,
    attributes = {},
  } = item;
  const { style, material, pattern, fit, length, occasion, season, details } =
    attributes;

  const tokens: string[] = [];

  // 1. Core identity
  tokens.push(categoryToken(category));
  tokens.push(normalize(type));

  if (subtype) {
    const subtypeNorm = normalize(subtype);
    tokens.push(subtypeNorm);
    // Split multiword subtypes
    const words = subtypeNorm.split(" ").filter(Boolean);
    if (words.length > 1) tokens.push(...words);
  }

  // 2. Colors
  tokens.push(normalize(mainColor));
  if (secondaryColor) tokens.push(normalize(secondaryColor));

  // 3. High-signal attributes
  if (style) tokens.push(normalize(style));
  if (material) tokens.push(normalize(material));
  if (pattern) tokens.push(normalize(pattern));

  // 4. Optional attributes (only if short + common)
  const shortOptional = [fit, length, occasion, season]
    .map((attr) => normalize(attr))
    .filter((attr) => attr && attr.length <= 12);
  tokens.push(...shortOptional);

  // 5. Details (compact tokens, 0-3 most distinctive)
  tokens.push(...splitDetails(details).slice(0, 3));

  // 6. Normalize & prune
  const cleaned = tokens
    .filter(Boolean)
    .map((token) =>
      token
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim(),
    )
    .filter(Boolean);

  // Dedupe while preserving order, cap length
  return [...new Set(cleaned)].slice(0, maxLen);
};

export const buildSearchDoc = (item: Item): string => {
  const {
    type,
    subtype,
    category,
    mainColor,
    secondaryColor,
    attributes = {},
  } = item;
  const { style, pattern, material, fit, length, occasion, season, details } =
    attributes;

  const typeNorm = normalize(type);
  const subtypeNorm = normalize(subtype);

  // Expand details lightly - split by comma, keep short phrases
  const detailTokens = details
    ? normalize(details)
        .split(",")
        .map((phrase) => phrase.trim())
        .filter((phrase) => phrase.length > 0 && phrase.length <= 20) // Skip very long phrases
        .slice(0, 3) // Keep max 3 detail phrases
    : [];

  const parts = [
    normalize(mainColor),
    secondaryColor ? normalize(secondaryColor) : "",
    subtypeNorm || typeNorm,
    subtypeNorm ? typeNorm : "", // Include type if subtype present
    categoryToken(category),
    normalize(style),
    normalize(pattern),
    normalize(material),
    normalize(fit),
    normalize(length),
    ...detailTokens,
    normalize(occasion),
    normalize(season),
  ].filter(Boolean);

  // Remove duplicates while preserving order
  const seen = new Set<string>();
  const deduplicated = parts.filter((part) => {
    if (seen.has(part)) return false;
    seen.add(part);
    return true;
  });

  return deduplicated.join(" ");
};
