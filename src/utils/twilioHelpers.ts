/**
 * Twilio-specific helper functions for message processing and validation.
 */

import twilio from 'twilio';
import { getLogger } from './logger';
import { TwilioMessageOptions, TwilioStatusCallbackPayload, TwilioApiError } from '../types/twilio';
import { sidToResolvers, sidToSeenStatuses } from '../services/twilioService';

const logger = getLogger('utils:twilio-helpers');

/**
 * Adds status callback URL to message options if configured.
 */
export function addStatusCallback(options: TwilioMessageOptions): void {
  const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (statusCallbackUrl) {
    options.statusCallback = statusCallbackUrl;
  }
}

/**
 * Handles Twilio API errors with appropriate logging.
 */
export function handleTwilioError(err: TwilioApiError): never {
  if (err && err.code === 20003) {
    logger.error('Twilio auth failed (401). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }
  throw err;
}

/**
 * Validates that an incoming request is authentic from Twilio.
 */
export function validateTwilioRequest( req: any ): boolean {
  const signature = req.header('X-Twilio-Signature') || req.header('x-twilio-signature');
  const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.get('host') as string);
  const fullUrl = `${protoHeader}://${hostHeader}${req.originalUrl}`;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (process.env.TWILIO_VALIDATE_WEBHOOK === 'false') return true;
  if (!authToken) return false;
  if (!signature) return false;
  return twilio.validateRequest(authToken, signature, fullUrl, req.body);
}

/**
 * Processes a Twilio status callback payload and resolves waiting promises.
 * Handles 'sent', 'delivered', and 'failed' statuses to complete delivery confirmation.
 */
export function processStatusCallback(payload: TwilioStatusCallbackPayload): void {
  const sid: string | undefined = payload?.MessageSid || payload?.SmsSid;
  const status: string | undefined = payload?.MessageStatus || payload?.SmsStatus;

  if (!sid || !status) {
    logger.warn({ payload }, 'Invalid callback payload: missing sid or status');
    return;
  }

  logger.info({ sid, status }, 'Twilio status callback received');

  const resolvers = sidToResolvers.get(sid);

  if (resolvers) {
    switch (status.toLowerCase()) {
      case 'sent':
        logger.info({ sid }, 'Message sent successfully');
        resolvers.resolveSent();

        if (resolvers.cleanupTimer) {
          clearTimeout(resolvers.cleanupTimer);
          resolvers.cleanupTimer = undefined;
        }
        break;

      case 'delivered':
        logger.info({ sid }, 'Message delivered successfully');
        resolvers.resolveDelivered();

        setTimeout(() => {
          sidToResolvers.delete(sid);
        }, 1000);
        break;

      case 'failed':
      case 'undelivered':
        logger.warn({ sid, status }, 'Message delivery failed');
        resolvers.resolveDelivered();

        setTimeout(() => {
          sidToResolvers.delete(sid);
        }, 1000);
        break;

      case 'queued':
      case 'sending':
        logger.debug({ sid, status }, 'Intermediate message status');
        break;

      default:
        logger.warn({ sid, status }, 'Unknown message status received');
    }
  } else {
    logger.debug({ sid, status }, 'No waiting resolvers found for message');

    const seenStatuses = sidToSeenStatuses.get(sid) || new Set<string>();
    seenStatuses.add(status.toLowerCase());

    if (seenStatuses.size > 10) {
      const recentStatuses = Array.from(seenStatuses).slice(-5);
      sidToSeenStatuses.set(sid, new Set(recentStatuses));
    } else {
      sidToSeenStatuses.set(sid, seenStatuses);
    }

    setTimeout(() => {
      const currentStatuses = sidToSeenStatuses.get(sid);
      if (currentStatuses) {
        currentStatuses.delete(status.toLowerCase());
        if (currentStatuses.size === 0) {
          sidToSeenStatuses.delete(sid);
        }
      }
    }, 300000);
  }
}
