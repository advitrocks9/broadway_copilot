import { StatusResolvers } from './common';

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
 * Twilio webhook payload structure for status callbacks.
 */
export interface TwilioStatusCallbackPayload {
  MessageSid?: string;
  SmsSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
}

/**
 * Re-export common types for convenience and backward compatibility.
 */
export type { StatusResolvers };
