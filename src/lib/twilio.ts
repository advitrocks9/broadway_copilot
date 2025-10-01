import 'dotenv/config';

import { Request } from 'express';
import twilio, { Twilio } from 'twilio';

import RequestClient from 'twilio/lib/base/RequestClient';
import {
  TWILIO_QUICKREPLY2_SID,
  TWILIO_QUICKREPLY3_SID,
  TWILIO_QUICKREPLY_STYLING_SID,
  TWILIO_QUICKREPLY_TONALITY_SID,
} from '../utils/constants';
import {
  BadRequestError,
  InternalServerError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { redis } from './redis';

import {
  QuickReplyButton,
  TwilioApiError,
  TwilioMessageOptions,
  TwilioStatusCallbackPayload,
} from './twilio/types';

type RedisSubscriber = ReturnType<typeof redis.duplicate>;

let subscriber: RedisSubscriber | undefined;

async function getSubscriber(): Promise<RedisSubscriber> {
  if (!subscriber || !subscriber.isOpen) {
    const client = redis.duplicate();
    await client.connect();
    subscriber = client;
  }

  if (!subscriber) {
    throw new InternalServerError('Failed to initialize Redis subscriber');
  }

  return subscriber;
}

let cachedClient: Twilio | undefined;

function getTwilioClient(): Twilio {
  if (cachedClient) return cachedClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new InternalServerError('Twilio credentials missing');

  const httpClient = new RequestClient({
    keepAlive: true,
    timeout: Number(process.env.TWILIO_HTTP_TIMEOUT_MS || 10000),
  });

  const clientOptions: Record<string, unknown> = {
    httpClient,
    userAgentExtensions: ['broadway-copilot'],
  };
  clientOptions.edge = 'singapore';
  cachedClient = twilio(accountSid, authToken, clientOptions);
  return cachedClient;
}

export async function sendText(to: string, body: string, imageUrl?: string): Promise<void> {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  try {
    const messageOptions: TwilioMessageOptions = {
      body,
      from: fromNumber,
      to: `whatsapp:+${to}`,
    };
    if (imageUrl) {
      messageOptions.mediaUrl = [imageUrl];
    }
    addStatusCallback(messageOptions);
    const resp = await client.messages.create(messageOptions);
    logger.debug({ sid: resp.sid, to }, 'Sent text message');
    await awaitStatuses(resp.sid);
  } catch (err: unknown) {
    handleTwilioError(err as TwilioApiError);
  }
}

export async function sendMenu(
  to: string,
  replyText: string,
  buttons: readonly QuickReplyButton[],
): Promise<void> {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (buttons.length < 2 || buttons.length > 3) {
    logger.warn(`Invalid button count ${buttons.length}; must be 2 or 3. Falling back to text`);
    await sendText(to, replyText);
    return;
  }

  const tonalityOptions = ['Hype BFF', 'Friendly', 'Savage'];
  const isTonality =
    buttons.length === 3 && buttons.every((b) => tonalityOptions.includes(b.text.trim()));

  // Updated template SID selection to include your custom styling template SID
  const contentSid = isTonality
    ? TWILIO_QUICKREPLY_TONALITY_SID
    : buttons.length === 2
      ? TWILIO_QUICKREPLY2_SID
      : buttons.length === 3 &&
          buttons.some((b) => ['Occasion', 'Pairing', 'Vacation'].includes(b.text))
        ? TWILIO_QUICKREPLY_STYLING_SID
        : TWILIO_QUICKREPLY3_SID;

  const templateLocales: Record<string, string> = {
    [TWILIO_QUICKREPLY_TONALITY_SID]: 'en',
    [TWILIO_QUICKREPLY2_SID]: 'en',
    [TWILIO_QUICKREPLY3_SID]: 'en',
    [TWILIO_QUICKREPLY_STYLING_SID]: 'en',
  };

  const localeCode = templateLocales[contentSid] || 'en';

  const contentVariables: Record<string, string> = {};

  const payload = {
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
    from: fromNumber,
    to: `whatsapp:+${to}`,
    language: { code: localeCode },
  } as unknown as TwilioMessageOptions;

  addStatusCallback(payload);

  try {
    const resp = await client.messages.create(payload);
    logger.debug({ sid: resp.sid, to, buttonCount: buttons.length }, 'Sent menu message');
    await awaitStatuses(resp.sid);
  } catch (err: unknown) {
    handleTwilioError(err as TwilioApiError);
  }
}

export async function sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
  await sendText(to, caption || '', imageUrl);
  logger.debug({ to, imageUrl }, 'Sent image message');
}

async function awaitStatuses(sid: string): Promise<void> {
  const configuredToWait = process.env.TWILIO_WAIT_FOR_STATUS === 'true';
  if (!configuredToWait) return;
  logger.debug({ sid }, 'Waiting for message status updates');
  const sentTimeoutMs = Number(process.env.TWILIO_SENT_TIMEOUT_MS || 5000);
  const deliveredTimeoutMs = Number(process.env.TWILIO_DELIVERED_TIMEOUT_MS || 15000);

  const channel = `twilio:status:${sid}`;
  const seenStatusesKey = `twilio:seen:${sid}`;

  const sub = await getSubscriber();

  let resolveSent!: () => void;
  let resolveDelivered!: () => void;

  const sentPromise = new Promise<void>((resolve) => {
    resolveSent = resolve;
  });
  const deliveredPromise = new Promise<void>((resolve) => {
    resolveDelivered = resolve;
  });

  const listener = (message: string) => {
    if (message === 'sent') {
      resolveSent();
    } else if (message === 'delivered' || message === 'failed' || message === 'undelivered') {
      resolveDelivered();
    }
  };

  await sub.subscribe(channel, listener);

  const preSeenStatuses = await redis.sMembers(seenStatusesKey);
  if (preSeenStatuses.includes('sent')) {
    resolveSent();
  }
  if (preSeenStatuses.some((s) => ['delivered', 'failed', 'undelivered'].includes(s))) {
    resolveDelivered();
  }

  const sentTimer = setTimeout(() => {
    logger.warn({ sid, timeout: sentTimeoutMs }, 'Timed out waiting for "sent" status');
    resolveSent();
  }, sentTimeoutMs);

  await sentPromise;
  clearTimeout(sentTimer);
  logger.debug({ sid }, 'Received "sent" status');

  const deliveredTimer = setTimeout(() => {
    logger.warn({ sid, timeout: deliveredTimeoutMs }, 'Timed out waiting for "delivered" status');
    resolveDelivered();
  }, deliveredTimeoutMs);

  await deliveredPromise;
  clearTimeout(deliveredTimer);
  logger.debug({ sid }, 'Received "delivered" status');

  await sub.unsubscribe(channel);
  redis.del(seenStatusesKey);
}

function addStatusCallback(options: TwilioMessageOptions): void {
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '') || '';
  if (serverUrl) {
    options.statusCallback = `${serverUrl}/twilio/callback/`;
  }
}

function handleTwilioError(err: TwilioApiError): never {
  if (err && err.code === 20003) {
    logger.error('Twilio auth failed (401). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    throw new UnauthorizedError('Twilio authentication failed');
  }

  if (err && err.code === 21211) {
    logger.error('Invalid phone number format');
    throw new BadRequestError('Invalid phone number format');
  }

  if (err && err.code === 21610) {
    logger.error('Message blocked by carrier');
    throw new ServiceUnavailableError('Message delivery blocked');
  }

  logger.error({ err }, 'Twilio API error');
  throw new ServiceUnavailableError('Message delivery failed');
}

export function validateTwilioRequest(req: Request): boolean {
  try {
    const signature = req.header('X-Twilio-Signature') || req.header('x-twilio-signature');
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.get('host') as string);
    const fullUrl = `${protoHeader}://${hostHeader}${req.originalUrl}`;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (process.env.TWILIO_VALIDATE_WEBHOOK === 'false') return true;
    if (!authToken) {
      logger.warn('Twilio auth token not configured');
      return false;
    }
    if (!signature) {
      logger.warn('Missing Twilio signature header');
      return false;
    }
    return twilio.validateRequest(authToken, signature, fullUrl, req.body);
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      'Error validating Twilio request',
    );
    return false;
  }
}

export function processStatusCallback(payload: TwilioStatusCallbackPayload): void {
  if (!payload) {
    logger.warn('Empty callback payload received');
    return;
  }

  const sid: string | undefined = payload?.MessageSid || payload?.SmsSid;
  const status: string | undefined = payload?.MessageStatus || payload?.SmsStatus;

  if (!sid || !status) {
    logger.warn({ payload }, 'Invalid callback payload: missing sid or status');
    return;
  }

  const statusLower = status.toLowerCase();
  const channel = `twilio:status:${sid}`;
  const seenStatusesKey = `twilio:seen:${sid}`;

  redis.publish(channel, statusLower);

  redis.sAdd(seenStatusesKey, statusLower);
  redis.expire(seenStatusesKey, 300); // 5 minutes TTL

  switch (statusLower) {
    case 'sent':
      logger.debug({ sid }, 'Message sent successfully');
      break;
    case 'delivered':
      logger.info({ sid }, 'Message delivered successfully');
      break;
    case 'failed':
    case 'undelivered':
      logger.warn({ sid, status }, 'Message delivery failed');
      break;
    case 'queued':
    case 'sending':
      break;
    default:
      logger.warn({ sid, status: statusLower }, 'Unknown message status received');
  }
}
