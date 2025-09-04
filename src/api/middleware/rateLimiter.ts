import { Request, Response, NextFunction } from 'express';
import redis from '../../lib/redis';
import { USER_REQUEST_LIMIT , TOKEN_REFILL_PERIOD_MS } from '../../utils/constants';

/**
 * Middleware for rate limiting user requests based on their WhatsApp ID.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  
  const waId = req.body.From;
  if (!waId) {
    return res.status(400).send('Missing WhatsApp ID.');
  }

  const key = `user:${waId}`;

  if (await redis.exists(key) === 0) {
    await redis.hSet(key, {
      tokens: USER_REQUEST_LIMIT,
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
    });
  }

  const updatedAtStr = await redis.hGet(key, 'updatedAt');
  const updatedAt = parseInt(updatedAtStr ?? '0', 10);
  const timePassed = Date.now() - updatedAt;
  const refills = Math.floor(timePassed / TOKEN_REFILL_PERIOD_MS);

  let tokenRemaining = parseInt(await redis.hGet(key, 'tokens') ?? '0', 10) + refills;
  tokenRemaining = Math.min(tokenRemaining, USER_REQUEST_LIMIT);

  if (tokenRemaining <= 0) {
    return res.status(429).send('Too many requests.');
  } else {
    await redis.hSet(key, {
      tokens: tokenRemaining - 1,
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
    });
  }

  next();
};
