import { QuickReplyButton } from '../types/common';

/**
 * Available intent labels for routing user requests to appropriate handlers.
 * These define the main categories of user interactions the agent can handle.
 */
export type IntentLabel =
  | 'general'
  | 'vibe_check'
  | 'color_analysis'
  | 'styling';

/**
 * Available services that can be offered to users.
 * Used for determining which features are accessible based on user state and cooldowns.
 */
export type AvailableService = 'vibe_check' | 'occasion' | 'vacation' | 'color_analysis' | 'suggest';

/**
 * Standard reply structure for agent responses.
 * Defines the format for all message types the agent can send back to users.
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

/**
 * Array of reply structures that define a complete agent response.
 * Multiple replies allow for complex interactions like image + text + quick replies.
 */
export type Replies = Reply[];

/**
 * Specific styling intents for fashion/styling related requests.
 * These are sub-categories under the main 'styling' intent.
 */
export type StylingIntent = 'occasion' | 'vacation' | 'pairing' | 'suggest';

/**
 * General conversation intents for non-styling related interactions.
 * These handle basic conversational flows like greetings and menu navigation.
 */
export type GeneralIntent = 'greeting' | 'menu' | 'chat';
