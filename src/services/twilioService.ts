import 'dotenv/config';
import twilio, { Twilio } from 'twilio';
import RequestClient from 'twilio/lib/base/RequestClient';
import { getLogger } from '../utils/logger';
import { TwilioApiError, TwilioMessageOptions, TwilioWebhookPayload, StatusResolvers } from '../types/twilio';
import { addStatusCallback, handleTwilioError, validateTwilioRequest } from '../utils/twilioHelpers';

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
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!fromNumber) {
    throw new Error('TWILIO_WHATSAPP_FROM environment variable is required');
  }
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
 * Sends an interactive menu message via Twilio WhatsApp.
 * Falls back to text message if TWILIO_MENU_SID is not configured.
 * @param to - The recipient's WhatsApp number
 * @param replyText - The text content to display in the menu
 */
export async function sendMenu(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_MENU_SID;
  if (!contentSid) {
    logger.warn('TWILIO_MENU_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!fromNumber) {
    throw new Error('TWILIO_WHATSAPP_FROM environment variable is required');
  }
  const payload: TwilioMessageOptions = {
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: fromNumber,
    to,
  };
  addStatusCallback(payload);
  const resp = await client.messages.create(payload);
  logger.info({ sid: resp.sid, to }, 'Sent menu message');
  await awaitStatuses(resp.sid);
}

/**
 * Sends a rich card message via Twilio WhatsApp.
 * Falls back to text message if TWILIO_CARD_SID is not configured.
 * @param to - The recipient's WhatsApp number
 * @param replyText - The text content to display in the card
 */
export async function sendCard(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_CARD_SID;
  if (!contentSid) {
    logger.warn('TWILIO_CARD_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;
  if (!fromNumber) {
    throw new Error('TWILIO_WHATSAPP_FROM environment variable is required');
  }
  const payload: TwilioMessageOptions = {
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: fromNumber,
    to,
  };
  addStatusCallback(payload);
  const resp = await client.messages.create(payload);
  logger.info({ sid: resp.sid, to }, 'Sent card message');
  await awaitStatuses(resp.sid);
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


