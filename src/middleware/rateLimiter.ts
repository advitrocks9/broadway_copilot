import { NextFunction, Request, Response } from 'express';
import { redis } from '../lib/redis';
import { TwilioWebhookRequest } from '../lib/twilio/types';
import {
  TOKEN_REFILL_PERIOD_MS,
  USER_REQUEST_LIMIT,
  USER_STATE_TTL_SECONDS,
} from '../utils/constants';
import { BadRequestError, HttpError, ServiceUnavailableError } from '../utils/errors';
import { logger } from '../utils/logger';
/**
 * Express middleware implementing token bucket rate limiting for user requests.
 * Uses Redis to track token counts with automatic refill over time.
 * Allows requests to proceed on rate limiter errors to avoid blocking users.
 *
 * @param req - Express request object containing user ID
 * @param _res - Express response object (unused)
 * @param next - Express next function to continue request processing
 * @throws {HttpError} When rate limit is exceeded (503 Service Unavailable)
 */
export const rateLimiter = async (req: Request, _res: Response, next: NextFunction) => {
  const webhook = req.body as TwilioWebhookRequest;
  const whatsappId = webhook.WaId;
  const messageId = req.body.MessageSid;

  if (!whatsappId) {
    throw new BadRequestError('Missing WhatsApp ID');
  }

  const key = `user:${whatsappId}`;

  try {
    if ((await redis.exists(key)) === 0) {
      await redis.hSet(key, {
        tokens: USER_REQUEST_LIMIT,
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
      });
      await redis.expire(key, USER_STATE_TTL_SECONDS);
      logger.debug({ whatsappId }, 'Rate limiter: initialized new user token bucket');
    }

    const updatedAtStr = await redis.hGet(key, 'updatedAt');
    const updatedAt = parseInt(updatedAtStr ?? '0', 10);
    const timePassed = Date.now() - updatedAt;
    const refills = Math.floor(timePassed / TOKEN_REFILL_PERIOD_MS);

    let tokenRemaining = parseInt((await redis.hGet(key, 'tokens')) ?? '0', 10) + refills;
    tokenRemaining = Math.min(tokenRemaining, USER_REQUEST_LIMIT);

    if (tokenRemaining <= 0) {
      logger.warn({ whatsappId, messageId }, 'Rate limit exceeded');
      throw new ServiceUnavailableError(`Rate limit exceeded for user ${whatsappId}`);
    } else {
      await redis.hSet(key, {
        tokens: tokenRemaining - 1,
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
      });
      await redis.expire(key, USER_STATE_TTL_SECONDS);
      logger.debug(
        { whatsappId, tokensRemaining: tokenRemaining - 1 },
        'Rate limiter: token consumed',
      );
    }

    next();
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      throw err;
    }
    // Allow request to proceed on rate limiter error to avoid blocking users
    next();
  }
};
