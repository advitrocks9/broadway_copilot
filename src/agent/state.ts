import { BaseMessage } from '@langchain/core/messages';
import { User, PendingType } from '@prisma/client';
import { Annotation } from '@langchain/langgraph';

import { TwilioWebhookRequest } from '../lib/twilio/types';
import { QuickReplyButton } from '../lib/twilio/types';

// ============================================================================
// AGENT STATE DEFINITION
// ============================================================================

/**
 * Defines the complete state for the agent's graph.
 * Includes all data required for processing a user request, from input to final reply.
 */
export const AgentState = Annotation.Root({
  /** Raw Twilio webhook request that initiated the interaction */
  input: Annotation<TwilioWebhookRequest>(),
  
  /** User profile information from the database */
  user: Annotation<User>(),
  
  /** Full conversation history including images, for multimodal models */
  conversationHistoryWithImages: Annotation<BaseMessage[]>(),
  
  /** Text-only conversation history for faster, text-based models */
  conversationHistoryTextOnly: Annotation<BaseMessage[]>(),
  
  /** The user's primary intent (e.g., 'styling', 'general') */
  intent: Annotation<IntentLabel | null>(),
  
  /** Specific sub-intent for styling requests */
  stylingIntent: Annotation<StylingIntent | null>(),
  
  /** Specific sub-intent for general conversation */
  generalIntent: Annotation<GeneralIntent | null>(),
  
  /** Field to be requested from the user if their profile is incomplete */
  missingProfileField: Annotation<MissingProfileField | null>(),
  
  /** List of services available to the user based on cooldowns */
  availableServices: Annotation<AvailableService[]>(),
  
  /** The generated reply to be sent to the user */
  assistantReply: Annotation<Replies | null>(),
  
  /** The pending action type, if the agent is waiting for user input */
  pending: Annotation<PendingType | null>(),
});

// ============================================================================
// STATE TYPES
// ============================================================================

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
 * Specific styling intents for fashion/styling related requests.
 * These are sub-categories under the main 'styling' intent.
 */
export type StylingIntent = 'occasion' | 'vacation' | 'pairing' | 'suggest';

/**
 * General conversation intents for non-styling related interactions.
 * These handle basic conversational flows like greetings and menu navigation.
 */
export type GeneralIntent = 'greeting' | 'menu' | 'chat';

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
 * Missing profile fields that need to be collected from the user.
 * Used to determine if the user needs to provide more information to fulfill the request.
 */
export type MissingProfileField = 'gender' | 'age_group';


/**
 * Type helper for the agent's state, derived from the AgentState annotation.
 */
export type GraphState = typeof AgentState.State;