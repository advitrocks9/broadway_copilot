import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errors';
import { staticUploadsMount } from '../utils/paths';
import { processStatusCallback } from '../utils/twilioHelpers';
import { getLogger } from '../utils/logger';
import redis, { connectRedis } from '../lib/redis';
import prisma from '../lib/prisma';
import { rateLimiter } from './middleware/rateLimiter';
import { authenticateRequest } from './middleware/auth';
import { runAgent } from '../agent/graph';
import { launchMemoryWorker } from '../services/memoryService';
import { launchWardrobeWorker } from '../services/wardrobeService';
import { launchImageUploadWorker } from '../services/imageUploadService';
import { MESSAGE_TTL_SECONDS, USER_STATE_TTL_SECONDS } from '../utils/constants';

const logger = getLogger('api');
const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/], credentials: true }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/uploads', express.static(staticUploadsMount()));

const userControllers: Map<string, { controller: AbortController; messageId: string }> = new Map();

app.post('/twilio/', authenticateRequest, rateLimiter, async (req, res) => {
  try { 
    const userId = req.body.From;
    const messageId = req.body.MessageSid;
    logger.debug({ userId, messageId }, 'Processing webhook');

    if (!userId || !messageId) {
      logger.warn('Missing userId or messageId in webhook');
      return res.status(400).end();
    }

    const messageKey = `message:${messageId}`;
    if (await redis.exists(messageKey) === 1) {
      logger.debug({ messageId }, 'Message already processed');
      return res.status(200).end();
    }

    await redis.hSet(messageKey, {
      userId,
      status: 'queued',
      createdAt: Date.now(),
    });
    await redis.expire(messageKey, MESSAGE_TTL_SECONDS);

    const userActiveKey = `user_active:${userId}`;
    
    // Use Redis transaction to atomically check and set active message
    const multi = redis.multi();
    multi.get(userActiveKey);
    const results = await multi.exec();
    const currentActive = results?.[0] as string | null;
    const currentStatus = currentActive ? await redis.hGet(`message:${currentActive}`, 'status') : null;

    const hasActiveRun = userControllers.has(userId);

    if (hasActiveRun && currentStatus === 'running') {
      const active = userControllers.get(userId);
      if (active) {
        active.controller.abort();
      }
    }

    if (currentStatus === 'sending') {
      const queueKey = `user_queue:${userId}`;
      await redis.rPush(queueKey, JSON.stringify({ messageId, input: req.body }));
      await redis.expire(queueKey, USER_STATE_TTL_SECONDS);
      logger.debug({ messageId, userId }, 'Queued message due to active sending');
      return res.status(200).end();
    } else {
      // Use SET NX (set if not exists) to prevent race conditions
      const setResult = await redis.set(userActiveKey, messageId, { 
        EX: USER_STATE_TTL_SECONDS,
        NX: true  // Only set if key doesn't exist
      });
      
      if (setResult) {
        logger.debug({ messageId, userId }, 'Starting message processing');
        processMessage(userId, messageId, req.body);
        return res.status(200).end();
      } else {
        // Another message is already being processed, queue this one
        const queueKey = `user_queue:${userId}`;
        await redis.rPush(queueKey, JSON.stringify({ messageId, input: req.body }));
        await redis.expire(queueKey, USER_STATE_TTL_SECONDS);
        logger.debug({ messageId, userId }, 'Queued message due to race condition');
        return res.status(200).end();
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message, messageId: req.body?.MessageSid }, 'Webhook processing failed');
    const messageId = req.body?.MessageSid;
    if (messageId) {
      await redis.hSet(`message:${messageId}`, { status: 'failed' });
    }
    return res.status(500).end();
  }
});

app.post('/twilio/callback/', authenticateRequest, async (req, res) => {
  try {
    processStatusCallback(req.body || {});
    return res.status(200).end();
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Callback processing failed');
    return res.status(500).end();
  }
});

app.use(errorHandler);

async function processMessage(userId: string, messageId: string, input: Record<string, any>): Promise<void> {
  const controller = new AbortController();
  userControllers.set(userId, { controller, messageId });

  const messageKey = `message:${messageId}`;
  await redis.hSet(messageKey, { status: 'running' });
  logger.debug({ userId, messageId }, 'Processing message');

  try {
    await runAgent(input, { signal: controller.signal });
    await redis.hSet(messageKey, { status: 'delivered' });
    logger.debug({ userId, messageId }, 'Message processed successfully');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.info({ userId, messageId }, 'Message processing aborted');
    } else {
      logger.error({ userId, messageId, err: err?.message }, 'Message processing failed');
    }
    await redis.hSet(messageKey, { status: 'failed' });
  } finally {
    const current = userControllers.get(userId);
    if (current && current.messageId === messageId) {
      userControllers.delete(userId);

      const queueKey = `user_queue:${userId}`;
      const nextStr = await redis.lPop(queueKey);
      if (nextStr) {
        const next = JSON.parse(nextStr);
        const userActiveKey = `user_active:${userId}`;
        await redis.set(userActiveKey, next.messageId, { EX: USER_STATE_TTL_SECONDS });
        logger.debug({ userId, nextMessageId: next.messageId }, 'Processing queued message');
        processMessage(userId, next.messageId, next.input);
      } else {
        const userActiveKey = `user_active:${userId}`;
        await redis.del(userActiveKey);
        logger.debug({ userId }, 'No more queued messages');
      }
    }
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received, closing gracefully');
  try {
    if (redis.isOpen) await redis.quit();
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

connectRedis();
logger.info('Connected to Redis');

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', async () => {
  logger.info({ port: PORT }, 'Broadway WhatsApp Bot server started');
  launchMemoryWorker();
  launchWardrobeWorker();
  launchImageUploadWorker();
});
