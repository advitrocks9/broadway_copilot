import { Request, Response, NextFunction } from 'express';
import { redis } from '../../lib/redis';
import { USER_REQUEST_LIMIT , TOKEN_REFILL_PERIOD_MS, USER_STATE_TTL_SECONDS } from '../../utils/constants';
import { getLogger } from '../../utils/logger';

const logger = getLogger('middleware:rate_limiter');

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {

  const waId = req.body.From;
  const messageId = req.body.MessageSid;

  if (!waId) {
    logger.warn({ messageId, ip: req.ip }, 'Rate limiter: missing WhatsApp ID');
    return res.status(400).send('Missing WhatsApp ID.');
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
      return res.status(429).send('Too many requests.');
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
    // Allow request to proceed on rate limiter error to avoid blocking users
    next();
  }
};
