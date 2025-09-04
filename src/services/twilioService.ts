import 'dotenv/config';
import twilio, { Twilio } from 'twilio';
import RequestClient from 'twilio/lib/base/RequestClient';
import { getLogger } from '../utils/logger';
import { TwilioApiError, TwilioMessageOptions, StatusResolvers } from '../types/twilio';
import { addStatusCallback, handleTwilioError } from '../utils/twilioHelpers';
import { QuickReplyButton } from '../types/common';
import {TWILIO_WHATSAPP_FROM, TWILIO_QUICKREPLY2_SID, TWILIO_QUICKREPLY3_SID } from '../utils/constants';

/**
 * Twilio messaging utilities for WhatsApp interactions.
 */
const logger = getLogger('service:twilio');

export const sidToResolvers = new Map<string, StatusResolvers>();
export const sidToSeenStatuses = new Map<string, Set<string>>();
  
/**
 * Provides a singleton Twilio client with keep-alive agent and optional edge/region.
 */
let cachedClient: Twilio | undefined;
function getClient(): Twilio {
  if (cachedClient) return cachedClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio credentials missing');

  const httpClient = new RequestClient({
    keepAlive: true,
    timeout: Number(process.env.TWILIO_HTTP_TIMEOUT_MS || 10000),
  });

  const clientOptions: any = {
    httpClient,
    userAgentExtensions: ['broadway-copilot'],
  };
  clientOptions.edge = 'singapore';
  cachedClient = twilio(accountSid, authToken, clientOptions);
  return cachedClient;
}

/**
 * Sends a text message via Twilio WhatsApp.
 * @param to - The recipient's WhatsApp number
 * @param body - The message content to send
 * @param imageUrl - Optional image URL to include with the message
 */
export async function sendText(to: string, body: string, imageUrl?: string): Promise<void> {
  const client = getClient();
  const fromNumber = TWILIO_WHATSAPP_FROM;
  try {
    const messageOptions: TwilioMessageOptions = {
      body,
      from: fromNumber,
      to,
    };
    if (imageUrl) {
      messageOptions.mediaUrl = [imageUrl];
    }
    addStatusCallback(messageOptions);
    const resp = await client.messages.create(messageOptions);
    logger.info({ sid: resp.sid, to }, 'Sent text message');
    await awaitStatuses(resp.sid);
  } catch (err: unknown) {
    handleTwilioError(err as TwilioApiError);
  }
}

/**
 * Sends an interactive menu message with quick reply buttons via Twilio WhatsApp.
 * @param to - The recipient's WhatsApp number
 * @param replyText - The text content to display in the menu
 * @param buttons - Array of quick reply buttons (2-3 buttons)
 */
export async function sendMenu(to: string, replyText: string, buttons?: QuickReplyButton[]): Promise<void> {
  const client = getClient();
  
  // If no buttons provided, fall back to text
  if (!buttons || buttons.length === 0) {
    logger.warn('No buttons provided for menu; falling back to text');
    await sendText(to, replyText);
    return;
  }
  
  // Validate button count (2-3 buttons)
  if (buttons.length < 2 || buttons.length > 3) {
    logger.warn(`Invalid button count ${buttons.length}; must be 2-3 buttons. Falling back to text`);
    await sendText(to, replyText);
    return;
  }
  
  // Select appropriate content SID based on button count
  const contentSid = buttons.length === 2 ? TWILIO_QUICKREPLY2_SID : TWILIO_QUICKREPLY3_SID;
  const fromNumber = TWILIO_WHATSAPP_FROM;
  
  // Build content variables
  const contentVariables: Record<string, string> = {
    '1': replyText,
    '2': buttons[0].text,
    '3': buttons[0].id,
    '4': buttons[1].text,
    '5': buttons[1].id
  };
  
  // Add third button if present
  if (buttons.length === 3) {
    contentVariables['6'] = buttons[2].text;
    contentVariables['7'] = buttons[2].id;
  }
  
  const payload: TwilioMessageOptions = {
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
    from: fromNumber,
    to,
  };
  
  addStatusCallback(payload);
  const resp = await client.messages.create(payload);
  logger.info({ sid: resp.sid, to, buttonCount: buttons.length }, 'Sent menu message with buttons');
  await awaitStatuses(resp.sid);
}

/**
 * Sends an image message via Twilio WhatsApp.
 * @param to - The recipient's WhatsApp number
 * @param imageUrl - The URL of the image to send
 * @param caption - Optional caption text for the image
 */
export async function sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
  await sendText(to, caption || '', imageUrl);
  logger.info({ to, imageUrl }, 'Sent image message');
}



/**
 * Awaits 'sent' and 'delivered' statuses with timeouts.
 */
async function awaitStatuses(sid: string): Promise<void> {
  const configuredToWait = process.env.TWILIO_WAIT_FOR_STATUS !== 'false';
  if (!configuredToWait) return;
  const sentTimeoutMs = Number(process.env.TWILIO_SENT_TIMEOUT_MS || 15000);
  const deliveredTimeoutMs = Number(process.env.TWILIO_DELIVERED_TIMEOUT_MS || 60000);

  let resolveSent!: () => void;
  let resolveDelivered!: () => void;
  const sentPromise = new Promise<void>((resolve) => { resolveSent = resolve; });
  const deliveredPromise = new Promise<void>((resolve) => { resolveDelivered = resolve; });
  const resolvers: StatusResolvers = { resolveSent, resolveDelivered, sentPromise, deliveredPromise };
  sidToResolvers.set(sid, resolvers);

  const preSeen = sidToSeenStatuses.get(sid);
  if (preSeen) {
    if (preSeen.has('sent')) resolveSent();
    if (preSeen.has('delivered')) resolveDelivered();
    sidToSeenStatuses.delete(sid);
  }

  const sentOrTimeout = Promise.race([
    sentPromise,
    new Promise<void>((resolve) => setTimeout(resolve, sentTimeoutMs)),
  ]);
  await sentOrTimeout;

  const deliveredOrTimeout = Promise.race([
    deliveredPromise,
    new Promise<void>((resolve) => setTimeout(resolve, deliveredTimeoutMs)),
  ]);
  await deliveredOrTimeout;

  // Set cleanup timer for resolvers (will be cleared if callbacks arrive)
  const cleanupTimer = setTimeout(() => {
    logger.debug({ sid }, 'Cleaning up expired message resolvers');
    sidToResolvers.delete(sid);
  }, 300000); // 5 minutes
  resolvers.cleanupTimer = cleanupTimer;
}


