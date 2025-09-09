import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';
import { USER_REQUEST_LIMIT , TOKEN_REFILL_PERIOD_MS, USER_STATE_TTL_SECONDS } from '../utils/constants';
import { logger }  from '../utils/logger';
import { createError } from '../utils/errors';

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

  const waId = req.body.From;
  const messageId = req.body.MessageSid;

  if (!waId) {
    logger.warn({ messageId, ip: req.ip }, 'Rate limiter: missing WhatsApp ID');
    throw createError.badRequest('Missing WhatsApp ID');
  }

  const key = `user:${waId}`;

  try {
    if (await redis.exists(key) === 0) {
      await redis.hSet(key, {
        tokens: USER_REQUEST_LIMIT,
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
      });
      await redis.expire(key, USER_STATE_TTL_SECONDS);
      logger.debug({ waId }, 'Rate limiter: initialized new user token bucket');
    }

    const updatedAtStr = await redis.hGet(key, 'updatedAt');
    const updatedAt = parseInt(updatedAtStr ?? '0', 10);
    const timePassed = Date.now() - updatedAt;
    const refills = Math.floor(timePassed / TOKEN_REFILL_PERIOD_MS);

    let tokenRemaining = parseInt(await redis.hGet(key, 'tokens') ?? '0', 10) + refills;
    tokenRemaining = Math.min(tokenRemaining, USER_REQUEST_LIMIT);

    logger.debug({ waId, tokensRemaining: tokenRemaining, refills }, 'Rate limiter: token check');

    if (tokenRemaining <= 0) {
      logger.warn({ waId, messageId }, 'Rate limit exceeded');
      throw createError.serviceUnavailable('Rate limit exceeded');
    } else {
      await redis.hSet(key, {
        tokens: tokenRemaining - 1,
        updatedAt: Date.now(),
        lastMessageAt: Date.now(),
      });
      await redis.expire(key, USER_STATE_TTL_SECONDS);
      logger.debug({ waId, tokensRemaining: tokenRemaining - 1 }, 'Rate limiter: token consumed');
    }

    next();
  } catch (err: any) {
    logger.error({ waId, messageId, err: err?.message }, 'Rate limiter error');
    if (err.statusCode) {
      throw err; // Re-throw HTTP errors as-is
    }
    // Allow request to proceed on rate limiter error to avoid blocking users
    next();
  }
};
