/**
 * Comprehensive type definitions for Twilio WhatsApp integration.
 *
 * This module provides strongly-typed interfaces for handling Twilio's WhatsApp API,
 * including webhook payloads, message options, and internal data structures used
 * throughout the application for reliable messaging operations.
 */

// ================================
// API Types
// ================================

/**
 * Represents an error response from the Twilio API.
 *
 * Extends the standard Error class with Twilio-specific error information
 * including error codes and HTTP status codes for better error handling
 * and debugging of API interactions.
 */
export interface TwilioApiError extends Error {
  code?: number;
  status?: number;
}

/**
 * Configuration options for sending messages via Twilio's API.
 *
 * Defines the structure for message parameters when creating outbound
 * WhatsApp messages, including text content, media attachments,
 * delivery tracking, and interactive content templates.
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
 * Payload structure for Twilio status callback webhooks.
 *
 * Contains delivery status information sent by Twilio when message
 * status changes (queued, sent, delivered, failed). Used to track
 * message delivery progress and handle delivery failures.
 */
export interface TwilioStatusCallbackPayload {
  MessageSid?: string;
  SmsSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
}

// ================================
// Webhook Types
// ================================

/**
 * Complete payload structure for incoming Twilio webhook requests.
 *
 * Represents the full data sent by Twilio when a WhatsApp message is received.
 * All values are strings since the payload uses application/x-www-form-urlencoded format.
 * Includes standard SMS parameters, WhatsApp-specific fields, media information,
 * geographic data, and interactive message components.
 *
 * @see https://www.twilio.com/docs/messaging/guides/webhook-request
 */
export interface TwilioWebhookRequest {
  // Core message identification and routing parameters
  MessageSid: string;
  SmsSid: string;
  SmsMessageSid: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  SmsStatus: string;
  ApiVersion: string;

  // Media attachment information (first media item)
  MediaUrl0?: string;
  MediaContentType0?: string;

  // Geographic location data of sender and recipient
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;

  // WhatsApp-specific sender and message metadata
  ProfileName?: string;
  WaId?: string;
  Forwarded?: string;
  FrequentlyForwarded?: string;
  ButtonText?: string;
  MessageType?: string;
  ButtonPayload?: string;

  // Channel-specific metadata (JSON string containing additional WhatsApp data)
  ChannelMetadata?: string;

  // Location sharing data for WhatsApp location messages
  Latitude?: string;
  Longitude?: string;
  Address?: string;
  Label?: string;

  // Click-to-WhatsApp advertisement tracking parameters
  ReferralBody?: string;
  ReferralHeadline?: string;
  ReferralSourceId?: string;
  ReferralSourceType?: string;
  ReferralSourceUrl?: string;
  ReferralMediaId?: string;
  ReferralMediaContentType?: string;
  ReferralMediaUrl?: string;
  ReferralNumMedia?: string;
  ReferralCtwaClid?: string;

  // Reply message context information
  OriginalRepliedMessageSender?: string;
  OriginalRepliedMessageSid?: string;

  // Index signature to handle dynamic media parameters (MediaUrl1, MediaUrl2, etc.)
  // and any future parameters Twilio might add
  [key: string]: string | undefined;
}

// ================================
// Internal Types
// ================================

/**
 * Represents a quick reply button for interactive WhatsApp messages.
 *
 * Defines the structure for buttons that users can tap to quickly respond
 * to messages without typing. Each button has display text and a unique
 * identifier for handling the user's selection.
 */
export interface QuickReplyButton {
  text: string;
  id: string;
}

/**
 * Promise-based resolvers for tracking WhatsApp message delivery status.
 *
 * Provides a mechanism to asynchronously wait for message delivery confirmations
 * from Twilio. Includes separate promises for 'sent' and 'delivered' status updates,
 * along with manual resolver functions and cleanup timers for timeout handling.
 */
export interface StatusResolvers {
  resolveSent: () => void;
  resolveDelivered: () => void;
  sentPromise: Promise<void>;
  deliveredPromise: Promise<void>;
  cleanupTimer?: NodeJS.Timeout;
}