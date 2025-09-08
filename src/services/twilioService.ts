import 'dotenv/config';
import twilio, { Twilio } from 'twilio';
import RequestClient from 'twilio/lib/base/RequestClient';
import { getLogger } from '../utils/logger';
import { TwilioApiError, TwilioMessageOptions, StatusResolvers } from '../types/twilio';
import { addStatusCallback, handleTwilioError } from '../utils/twilioHelpers';
import { QuickReplyButton } from '../types/common';
import {TWILIO_WHATSAPP_FROM, TWILIO_QUICKREPLY2_SID, TWILIO_QUICKREPLY3_SID } from '../utils/constants';

const logger = getLogger('service:twilio');

export const sidToResolvers = new Map<string, StatusResolvers>();
export const sidToSeenStatuses = new Map<string, Set<string>>();

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  // Clean up old resolvers
  for (const [sid, resolver] of sidToResolvers.entries()) {
    if (resolver.createdAt && (now - resolver.createdAt) > maxAge) {
      sidToResolvers.delete(sid);
      logger.debug({ sid }, 'Cleaned up expired resolver');
    }
  }
  
  // Clean up old seen statuses
  for (const [sid, statuses] of sidToSeenStatuses.entries()) {
    if (statuses.size === 0) {
      sidToSeenStatuses.delete(sid);
    }
  }
}, 60000); // Run cleanup every minute
  
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

export async function sendMenu(to: string, replyText: string, buttons?: QuickReplyButton[]): Promise<void> {
  const client = getClient();
  
  if (!buttons || buttons.length === 0) {
    logger.warn('No buttons provided for menu; falling back to text');
    await sendText(to, replyText);
    return;
  }

  if (buttons.length < 2 || buttons.length > 3) {
    logger.warn(`Invalid button count ${buttons.length}; must be 2-3 buttons. Falling back to text`);
    await sendText(to, replyText);
    return;
  }

  const contentSid = buttons.length === 2 ? TWILIO_QUICKREPLY2_SID : TWILIO_QUICKREPLY3_SID;
  const fromNumber = TWILIO_WHATSAPP_FROM;

  const contentVariables: Record<string, string> = {
    '1': replyText,
    '2': buttons[0].text,
    '3': buttons[0].id,
    '4': buttons[1].text,
    '5': buttons[1].id
  };

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

export async function sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
  await sendText(to, caption || '', imageUrl);
  logger.info({ to, imageUrl }, 'Sent image message');
}

async function awaitStatuses(sid: string): Promise<void> {
  const configuredToWait = process.env.TWILIO_WAIT_FOR_STATUS !== 'false';
  if (!configuredToWait) return;
  const sentTimeoutMs = Number(process.env.TWILIO_SENT_TIMEOUT_MS || 15000);
  const deliveredTimeoutMs = Number(process.env.TWILIO_DELIVERED_TIMEOUT_MS || 60000);

  let resolveSent!: () => void;
  let resolveDelivered!: () => void;
  const sentPromise = new Promise<void>((resolve) => { resolveSent = resolve; });
  const deliveredPromise = new Promise<void>((resolve) => { resolveDelivered = resolve; });
  const resolvers: StatusResolvers = { 
    resolveSent, 
    resolveDelivered, 
    sentPromise, 
    deliveredPromise,
    createdAt: Date.now()
  };
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
    logger.debug({ sid }, 'Cleaning up expired message resolvers');
    sidToResolvers.delete(sid);
  }, 300000); // 5 minutes
  resolvers.cleanupTimer = cleanupTimer;
}