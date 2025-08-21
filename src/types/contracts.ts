import { z } from 'zod';

/**
 * Zod schemas and types for model-structured responses and wardrobe items.
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

export const VibeCheckResponseSchema = z
  .object({
    vibe_score: z.number().nullable(),
    vibe_reply: z.string(),
    categories: z.array(VibeCategorySchema).length(4),
    reply_text: z.string(),
    followup_text: z.string().nullable(),
  })
  .strict();

export type VibeCheckResponse = z.infer<typeof VibeCheckResponseSchema>;

export const ColorObjectSchema = z.object({ name: z.string(), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/) });

export const ColorAnalysisSchema = z.object({
  reply_text: z.string(),
  followup_text: z.string().nullable(),
  skin_tone: ColorObjectSchema.nullable(),
  eye_color: ColorObjectSchema.nullable(),
  hair_color: ColorObjectSchema.nullable(),
  undertone: z.enum(['Warm','Cool','Neutral']).nullable(),
  palette_name: z.enum(['Light Spring','True Spring','Bright Spring','Light Summer','True Summer','Soft Summer','Soft Autumn','True Autumn','Dark Autumn','Bright Winter','True Winter','Dark Winter']).nullable(),
  palette_comment: z.string().nullable(),
  top3_colors: z.array(ColorObjectSchema).default([]),
  avoid3_colors: z.array(ColorObjectSchema).default([]),
});

export type ColorAnalysis = z.infer<typeof ColorAnalysisSchema>;

export const WardrobeItemSchema = z.object({
  category: z.string(),
  type: z.string(),
  subtype: z.string().nullable(),
  attributes: z.object({
    style: z.string().nullable(),
    pattern: z.string().nullable(),
    color_primary: z.string().nullable(),
    color_secondary: z.string().nullable(),
    material: z.string().nullable(),
    fit: z.string().nullable(),
    length: z.string().nullable(),
    details: z.string().nullable(),
  }),
});

export const WardrobeIndexResponseSchema = z.object({
  status: z.enum(["ok", "bad_photo"]).default("ok"),
  items: z.array(WardrobeItemSchema).default([]),
});

export type WardrobeIndexResponse = z.infer<typeof WardrobeIndexResponseSchema>;
export const WardrobeDetectionSchema = z.array(WardrobeItemSchema);
export type WardrobeItem = z.infer<typeof WardrobeItemSchema>;
export type WardrobeDetection = z.infer<typeof WardrobeDetectionSchema>;

