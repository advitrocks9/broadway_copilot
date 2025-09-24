/**
 * @module redis
 * @description Redis client module providing a singleton connection with reconnection handling
 * and event logging. Used for rate limiting, message queues, abort signals, and delivery tracking.
 */

import { createClient } from 'redis';

import { logger } from '../utils/logger';

// Singleton to prevent connection leaks during hot reload
const globalForRedis = global as unknown as {
  redis: ReturnType<typeof createClient>;
};

export const redis =
  globalForRedis.redis ||
  createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

redis.on('error', (err) => logger.error({ err: err.message }, 'Redis client error'));
redis.on('connect', () => logger.info('Redis client connected'));
redis.on('disconnect', () => logger.warn('Redis client disconnected'));
redis.on('reconnecting', () => logger.info('Redis client reconnecting'));
redis.on('ready', () => logger.info('Redis client ready'));

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export const connectRedis = async (): Promise<void> => {
  if (!redis.isOpen) {
    try {
      await redis.connect();
    } catch (err: unknown) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), url: process.env.REDIS_URL },
        'Failed to connect to Redis',
      );
      throw err;
    }
  } else {
    logger.debug('Redis client already connected');
  }
};
