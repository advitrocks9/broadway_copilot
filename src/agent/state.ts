import { z } from 'zod';
import { QuickReplyButton } from '../types/common';
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

export type AvailableService = 'vibe_check' | 'occasion' | 'vacation' | 'color_analysis' | 'suggest';

/**
 * Standard reply structure for each node in the graph.
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

export type Replies = Reply[];
