import { z } from 'zod';

export const VibeCheckResponseSchema = z.object({
  reply: z.string(),
  followup: z.string().nullable(),
  mode: z.enum(['full_ootd', 'selfie_look']).nullable(),
  overall_score: z.number().nullable(),
  scores: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()]))
    .nullable(),
});

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

