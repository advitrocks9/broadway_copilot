import { createClient } from 'redis';

import { logger } from '../utils/logger';

/**
 * Global Redis client instance with connection management and error handling.
 * Uses singleton pattern to prevent multiple connections in development.
 */
const globalForRedis = global as unknown as {
  redis: ReturnType<typeof createClient>;
};

/**
 * Redis client instance configured with connection URL from environment.
 * Singleton pattern prevents multiple connections during hot reloading in development.
 */
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

/**
 * Establishes connection to Redis if not already connected.
 * Sets up singleton pattern for development environments to prevent connection leaks.
 *
 * @throws {Error} When Redis connection fails
 */
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
