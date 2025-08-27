import { z } from 'zod';
import { GraphMessages, ModelMessage, WardrobeContext, LatestColorAnalysis, Reply, UserGender, MessageMode } from '../types/common';
/**
 * Re-export Reply type for backward compatibility and convenience.
 */
export type { Reply };

/**
 * Available intent labels for routing user requests to appropriate handlers.
 */
export type IntentLabel =
  | 'general'
  | 'occasion'
  | 'vacation'
  | 'pairing'
  | 'vibe_check'
  | 'color_analysis'
  | 'suggest';

/**
 * Zod schema for validating intent labels.
 */
export const IntentSchema = z.object({
  intent: z.enum(['general', 'occasion', 'vacation', 'pairing', 'vibe_check', 'color_analysis', 'suggest']),
});

/**
 * Input parameters for running the agent graph.
 */
export interface RunInput {
  /** Unique identifier for the user */
  userId: string;
  /** WhatsApp identifier for the user */
  waId: string;
  /** Text content of the message */
  text?: string;
  /** Path to uploaded image file */
  imagePath?: string;
  /** OpenAI file ID for vision processing */
  fileId?: string;
  /** Payload from interactive buttons */
  buttonPayload?: string;
  /** User's gender preference for personalization */
  gender?: UserGender;
  /** Runtime generation identifier for tracking */
  runGen?: number;
}

/**
 * Output result from running the agent graph.
 */
export interface RunOutput {
  /** The text response to send to the user */
  replyText: string;
  /** The response mode (text, menu, or card) */
  mode?: MessageMode;
}

/**
 * Required profile fields that may need to be collected from users.
 */
export type RequiredProfileField = 'gender';

/**
 * Additional context items that can be requested for downstream prompts.
 */
export type AdditionalContextItem = 'wardrobeItems' | 'latestColorAnalysis';

/**
 * Zod schema for validating inferred profile information.
 */
export const InferredProfileSchema = z.object({
  gender: z.enum(['male', 'female']).nullable().optional(),
});

/**
 * Final state type returned by the agent graph execution.
 * Represents the processed result containing reply information and metadata.
 */
export interface FinalState {
  reply?: string | Reply;
  replies?: Array<string | Reply>;
  mode?: MessageMode;
  intent?: IntentLabel;
}
