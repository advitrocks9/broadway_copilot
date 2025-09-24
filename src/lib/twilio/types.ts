export interface TwilioApiError extends Error {
  code?: number;
  status?: number;
}

export interface TwilioMessageOptions {
  body?: string;
  from: string;
  to: string;
  mediaUrl?: string[];
  statusCallback?: string;
  contentSid?: string;
  contentVariables?: string;
}

export interface TwilioStatusCallbackPayload {
  MessageSid?: string;
  SmsSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
}

/** @see https://www.twilio.com/docs/messaging/guides/webhook-request */
export interface TwilioWebhookRequest {
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

  MediaUrl0?: string;
  MediaContentType0?: string;

  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;

  ProfileName?: string;
  WaId?: string;
  Forwarded?: string;
  FrequentlyForwarded?: string;
  ButtonText?: string;
  MessageType?: string;
  ButtonPayload?: string;

  ChannelMetadata?: string;

  Latitude?: string;
  Longitude?: string;
  Address?: string;
  Label?: string;

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

  OriginalRepliedMessageSender?: string;
  OriginalRepliedMessageSid?: string;

  [key: string]: string | undefined;
}

export interface QuickReplyButton {
  text: string;
  id: string;
}
