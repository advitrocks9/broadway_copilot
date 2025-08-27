import { QueueEntry, BucketState, RateLimitResult, StatusResolvers, ProcessingState } from './common';

/**
 * Twilio-specific types and interfaces for WhatsApp integration.
 */

/**
 * Twilio API error with code and message properties.
 */
export interface TwilioApiError extends Error {
  code?: number;
  status?: number;
}

/**
 * Message options for Twilio API calls.
 */
export interface TwilioMessageOptions {
  body?: string;
  from: string;
  to: string;
  mediaUrl?: string[];
  statusCallback?: string;
  contentSid?: string;
  contentVariables?: string;
}

/**
 * Twilio webhook payload structure for incoming messages.
 */
export interface TwilioWebhookPayload {
  From?: string;
  To?: string;
  Body?: string;
  MessageSid?: string;
  SmsSid?: string;
  SmsMessageSid?: string;
  WaId?: string;
  MessageStatus?: string;
  SmsStatus?: string;
  NumMedia?: string;
  MediaUrl0?: string;
}

/**
 * Twilio webhook payload structure for status callbacks.
 */
export interface TwilioStatusCallbackPayload {
  MessageSid?: string;
  SmsSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
}

/**
 * Options for orchestrating inbound messages.
 */
export interface OrchestrateOptions {
  /** The raw Twilio webhook payload */
  body: TwilioWebhookPayload;
}

/**
 * Twilio-specific queue entry that extends the common QueueEntry.
 */
export interface TwilioQueueEntry extends Omit<QueueEntry, 'body'> {
  /** Twilio webhook payload */
  body: TwilioWebhookPayload;
}

/**
 * Record of an inbound message with its processing state.
 */
export interface InboundRecord {
  /** Message identifier */
  id: string;
  /** WhatsApp identifier */
  waId: string;
  /** Timestamp of the record */
  ts: number;
  /** Current processing state */
  state: ProcessingState;
}

/**
 * Re-export common types for convenience and backward compatibility.
 */
export type { BucketState, QueueEntry, StatusResolvers, ProcessingState };

/**
 * Alias for ProcessingState to maintain backward compatibility.
 */
export type InboundState = ProcessingState;
