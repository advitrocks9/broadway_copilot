import { z } from 'zod';

export type IntentLabel =
  | 'general'
  | 'occasion'
  | 'vacation'
  | 'pairing'
  | 'vibe_check'
  | 'color_analysis'
  | 'suggest'
;

export const IntentSchema = z.object({
  intent: z.enum(['general', 'occasion', 'vacation', 'pairing', 'vibe_check', 'color_analysis', 'suggest']),
});

export type RunInput = {
  userId: string;
  waId: string;
  text?: string;
  // Local path where we stored the image, not used for model input
  imagePath?: string;
  // OpenAI Files API id for the uploaded image
  fileId?: string;
  buttonPayload?: string;
};

export type RunOutput = { replyText: string; mode?: 'text' | 'menu' | 'card' };

export type RequiredProfileField = 'gender';

export type Reply = {
  reply_type: 'text' | 'menu' | 'card';
  reply_text: string;
}

export type ModelMessage =
  | { role: 'user'; content: string | Array<{ type: 'input_text'; text: string } | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' }>; intent?: string | null }
  | { role: 'assistant'; content: string; intent?: string | null };

export const InferredProfileSchema = z.object({
  gender: z.enum(['male', 'female']).nullable().optional(),
});
