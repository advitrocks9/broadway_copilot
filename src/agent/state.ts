import { QuickReplyButton } from '../types/common';
/**
 * Available intent labels for routing user requests to appropriate handlers.
 */
export type IntentLabel =
  | 'general'
  | 'vibe_check'
  | 'color_analysis'
  | 'styling';

export type AvailableService = 'vibe_check' | 'occasion' | 'vacation' | 'color_analysis' | 'suggest';

/**
 * Standard reply structure for each node in the graph.
 */
type Reply =
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

export type StylingIntent = 'occasion' | 'vacation' | 'pairing' | 'suggest';
