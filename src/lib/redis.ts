import { createClient } from 'redis';

/**
 * Global variable to cache the Redis client instance.
 */
const globalForRedis = global as unknown as { redis: ReturnType<typeof createClient> };

/**
 * Singleton Redis client instance.
 * Configured with REDIS_URL from environment variables.
 * In production, creates a new instance.
 * In development, reuses the cached instance.
 */
export const redis = globalForRedis.redis || createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err) => console.log('Redis Client Error', err));

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

export default redis;
