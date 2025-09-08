import { createClient } from 'redis';
import { getLogger } from '../utils/logger';

const globalForRedis = global as unknown as { redis: ReturnType<typeof createClient> };
const logger = getLogger('lib:redis');

export const redis = globalForRedis.redis || createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => logger.error({ err: err.message }, 'Redis client error'));
redis.on('connect', () => logger.info('Redis client connected'));
redis.on('disconnect', () => logger.warn('Redis client disconnected'));
redis.on('reconnecting', () => logger.info('Redis client reconnecting'));
redis.on('ready', () => logger.info('Redis client ready'));

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export const connectRedis = async () => {
  if (!redis.isOpen) {
    logger.info('Connecting to Redis...');
    try {
      await redis.connect();
      logger.info('Successfully connected to Redis');
    } catch (err: any) {
      logger.error({ err: err.message, url: process.env.REDIS_URL }, 'Failed to connect to Redis');
      throw err;
    }
  } else {
    logger.debug('Redis client already connected');
  }
};
