import { z } from 'zod';

export const OutfitRatingGoodSchema = z.object({
  fit_silhouette: z.number().min(0).max(10),
  color_harmony: z.number().min(0).max(10),
  styling_details: z.number().min(0).max(10),
  accessories_texture: z.number().min(0).max(10),
  context_confidence: z.number().min(0).max(10),
  overall_score: z.number().min(0).max(10),
  comment: z.string().min(1),
});

export const OutfitRatingBadSchema = z.object({ bad_upload: z.any() });

export const OutfitRatingSchema = z.union([OutfitRatingGoodSchema, OutfitRatingBadSchema]);

export type OutfitRating = z.infer<typeof OutfitRatingSchema>;
export type OutfitRatingGood = z.infer<typeof OutfitRatingGoodSchema>;

export const ColorAnalysisSchema = z.object({
  skin_tone: z.string().nullable(),
  eye_color: z.string().nullable(),
  hair_color: z.string().nullable(),
  top3_colors: z.array(z.string()),
  avoid3_colors: z.array(z.string()),
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

