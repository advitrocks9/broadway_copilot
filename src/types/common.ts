/**
 * Common types and interfaces shared across the application.
 * This file contains standardized type definitions used throughout the Broadway Copilot system.
 */

/**
 * OpenAI file upload response structure.
 */
export interface OpenAIFileResponse {
  id: string;
  object: string;
  created_at: number;
  filename: string;
  purpose: string;
  status?: string;
}

/**
 * Graph state messages array type.
 */
export type GraphMessages = ModelMessage[];

/**
 * Message format for model interactions with role-based content.
 */
export type ModelMessage =
  | {
      role: 'user';
      content: string | Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_image'; file_id: string; detail?: 'auto' | 'low' | 'high' }
      >;
      intent?: string | null;
      metadata?: Record<string, unknown>;
    }
  | {
      role: 'assistant';
      content: string;
      intent?: string | null;
      metadata?: Record<string, unknown>;
    };

/**
 * Wardrobe context data structure containing user's clothing items.
 */
export interface WardrobeContext {
  items: Array<{
    name: string;
    category: string;
    colors: unknown;
    subtype: string | null;
    attributes: unknown;
    createdAt: Date;
  }>;
}

/**
 * Latest color analysis data structure containing user's color profile.
 */
export interface LatestColorAnalysis {
  palette_name: string | null;
  top_3_colors: unknown;
  bottom_3_colors: unknown;
  undertone: string | null;
}

/**
 * Quick reply button structure for interactive messages.
 */
export interface QuickReplyButton {
  text: string;
  id: string;
}

/**
 * Standard reply structure used throughout the application.
 */
export type Reply =
  | {
      reply_type: 'text';
      reply_text: string;
    }
  | {
      reply_type: 'quick_reply';
      reply_text: string;
      buttons: QuickReplyButton[];
    }
  | {
      reply_type: 'image';
      media_url: string;
      reply_text?: string;
    };

/**
 * Color object with name and hex code representation.
 */
export interface ColorObject {
  name: string;
  hex: string;
}

/**
 * User gender type definition.
 */
export type UserGender = 'male' | 'female' | null;

/**
 * Message processing mode for responses.
 */
export type MessageMode = 'text' | 'quick_reply' | 'image';

/**
 * Processing state for inbound messages.
 */
export type ProcessingState = 'received' | 'processing' | 'sent' | 'aborted';

/**
 * Queue entry for message processing.
 */
export interface QueueEntry {
  id: string;
  body: unknown;
  ts: number;
}

/**
 * Rate limiting bucket state.
 */
export interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

/**
 * Rate limiting result.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Status resolvers for tracking message delivery.
 */
export interface StatusResolvers {
  resolveSent: () => void;
  resolveDelivered: () => void;
  sentPromise: Promise<void>;
  deliveredPromise: Promise<void>;
  cleanupTimer?: NodeJS.Timeout;
}
