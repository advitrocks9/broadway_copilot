import { z } from 'zod';

/**
 * Zod schemas and types for model-structured responses and wardrobe items.
 */

/**
 * Schema for vibe check category with heading and score.
 */
export const VibeCategorySchema = z
  .object({
    heading: z.enum([
      'Fit & Silhouette',
      'Color Harmony',
      'Styling Details',
      'Context & Confidence',
      'Skin Glow',
      'Makeup Blend',
      'Hair Style',
      'Visible Clothing Style',
    ]),
    score: z.number().min(0).max(10),
  })
  .strict();

/**
 * Schema for complete vibe check response from AI model.
 */
export const VibeCheckResponseSchema = z
  .object({
    vibe_score: z.number().nullable(),
    vibe_reply: z.string(),
    categories: z.array(VibeCategorySchema).length(4),
    reply_text: z.string(),
    followup_text: z.string().nullable(),
  })
  .strict();

/**
 * Type for vibe check response.
 */
export type VibeCheckResponse = z.infer<typeof VibeCheckResponseSchema>;

/**
 * Schema for color object with name and hex code.
 */
export const ColorObjectSchema = z.object({
  name: z.string(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
});

/**
 * Schema for comprehensive color analysis response.
 */
export const ColorAnalysisSchema = z.object({
  reply_text: z.string(),
  followup_text: z.string().nullable(),
  skin_tone: ColorObjectSchema.nullable(),
  eye_color: ColorObjectSchema.nullable(),
  hair_color: ColorObjectSchema.nullable(),
  undertone: z.enum(['Warm', 'Cool', 'Neutral']).nullable(),
  palette_name: z.enum([
    'Light Spring', 'True Spring', 'Bright Spring',
    'Light Summer', 'True Summer', 'Soft Summer',
    'Soft Autumn', 'True Autumn', 'Dark Autumn',
    'Bright Winter', 'True Winter', 'Dark Winter'
  ]).nullable(),
  palette_comment: z.string().nullable(),
  top3_colors: z.array(ColorObjectSchema).default([]),
  avoid3_colors: z.array(ColorObjectSchema).default([]),
});

/**
 * Type for color analysis response.
 */
export type ColorAnalysis = z.infer<typeof ColorAnalysisSchema>;

/**
 * Schema for individual wardrobe item attributes.
 */
export const WardrobeItemAttributesSchema = z.object({
  style: z.string().nullable(),
  pattern: z.string().nullable(),
  color_primary: z.string().nullable(),
  color_secondary: z.string().nullable(),
  material: z.string().nullable(),
  fit: z.string().nullable(),
  length: z.string().nullable(),
  details: z.string().nullable(),
});

/**
 * Schema for individual wardrobe item detected from image.
 */
export const WardrobeItemSchema = z.object({
  category: z.string(),
  type: z.string(),
  subtype: z.string().nullable(),
  attributes: WardrobeItemAttributesSchema,
});

/**
 * Schema for wardrobe index response from AI vision model.
 */
export const WardrobeIndexResponseSchema = z.object({
  status: z.enum(['ok', 'bad_photo']).default('ok'),
  items: z.array(WardrobeItemSchema).default([]),
});

/**
 * Type for wardrobe index response.
 */
export type WardrobeIndexResponse = z.infer<typeof WardrobeIndexResponseSchema>;

/**
 * Schema for array of detected wardrobe items.
 */
export const WardrobeDetectionSchema = z.array(WardrobeItemSchema);

/**
 * Type for individual wardrobe item.
 */
export type WardrobeItem = z.infer<typeof WardrobeItemSchema>;

/**
 * Type for wardrobe detection results.
 */
export type WardrobeDetection = z.infer<typeof WardrobeDetectionSchema>;

