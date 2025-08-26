import 'dotenv/config';
import twilio, { Twilio } from 'twilio';
import RequestClient from 'twilio/lib/base/RequestClient';
import { getLogger } from '../utils/logger';

/**
 * Twilio messaging utilities for WhatsApp interactions.
 */
const logger = getLogger('service:twilio');
 
/**
 * Tracks message status promises for 'sent' and 'delivered'.
 */
type StatusResolvers = {
  resolveSent: () => void;
  resolveDelivered: () => void;
  sentPromise: Promise<void>;
  deliveredPromise: Promise<void>;
  cleanupTimer?: NodeJS.Timeout;
};
const sidToResolvers = new Map<string, StatusResolvers>();
const sidToSeenStatuses = new Map<string, Set<string>>();
  
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

export async function sendText(to: string, body: string, imageUrl?: string): Promise<void> {
  const client = getClient();
  try {
    const messageOptions: any = {
      body,
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
    };
    if (imageUrl) {
      messageOptions.mediaUrl = [imageUrl];
    }
    const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
    if (statusCallbackUrl) {
      messageOptions.statusCallback = statusCallbackUrl;
    }
    const resp = await client.messages.create(messageOptions);
    logger.info({ sid: resp.sid, to }, 'Sent text message');
    await awaitStatuses(resp.sid);
  } catch (err: any) {
    if (err && err.code === 20003) {
      logger.error('Twilio auth failed (401). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }
    throw err;
  }
}

export async function sendMenu(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_MENU_SID;
  if (!contentSid) {
    logger.warn('TWILIO_MENU_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  const payload: any = {
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
  };
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (statusCallbackUrl) {
    payload.statusCallback = statusCallbackUrl;
  }
  const resp = await client.messages.create(payload);
  logger.info({ sid: resp.sid, to }, 'Sent menu message');
  await awaitStatuses(resp.sid);
}

export async function sendCard(to: string, replyText: string): Promise<void> {
  const client = getClient();
  const contentSid = process.env.TWILIO_CARD_SID;
  if (!contentSid) {
    logger.warn('TWILIO_CARD_SID missing; falling back to text');
    await sendText(to, replyText);
    return;
  }
  const payload: any = {
    contentSid,
    contentVariables: JSON.stringify({ '1': replyText }),
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
  };
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (statusCallbackUrl) {
    payload.statusCallback = statusCallbackUrl;
  }
  const resp = await client.messages.create(payload);
  logger.info({ sid: resp.sid, to }, 'Sent card message');
  await awaitStatuses(resp.sid);
}

export function validateTwilioRequest(url: string, params: Record<string, any>, signature: string | undefined): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (process.env.TWILIO_VALIDATE_WEBHOOK === 'false') return true;
  if (!authToken) return false;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

/**
 * Processes a Twilio status callback payload.
 */
export function processStatusCallback(payload: Record<string, any>): void {
  const sid: string | undefined = payload?.MessageSid || payload?.SmsSid;
  const status: string | undefined = payload?.MessageStatus || payload?.SmsStatus;
  if (!sid || !status) return;
  logger.info({ sid, status }, 'Twilio status callback received');
  const resolvers = sidToResolvers.get(sid);
  if (!resolvers) {
    const seen = sidToSeenStatuses.get(sid) || new Set<string>();
    seen.add(status);
    sidToSeenStatuses.set(sid, seen);
    return;
  }
  if (status === 'sent') {
    resolvers.resolveSent();
  }
  if (status === 'delivered') {
    resolvers.resolveDelivered();
  }
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

  const cleanupTimer = setTimeout(() => {
    sidToResolvers.delete(sid);
  }, 300000);
  resolvers.cleanupTimer = cleanupTimer;
}


