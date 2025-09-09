import 'dotenv/config';

import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';

import { authenticateRequest } from './middleware/auth';
import { errorHandler } from './middleware/errors';
import { rateLimiter } from './middleware/rateLimiter';
import { runAgent } from './agent/graph';
import { connectRedis, redis } from './lib/redis';
import { processStatusCallback } from './lib/twilio';
import { MESSAGE_TTL_SECONDS, USER_STATE_TTL_SECONDS } from './utils/constants';
import { createError } from './utils/errors';
import { logger } from './utils/logger';
import { staticUploadsMount } from './utils/paths';

const app = express();
app.set('trust proxy', true);

app.use(cors({
  origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
  credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/uploads', express.static(staticUploadsMount()));

const getMessageKey = (id: string) => `message:${id}`;
const getUserActiveKey = (id: string) => `user_active:${id}`;
const getUserQueueKey = (id: string) => `user_queue:${id}`;

const userControllers: Map<string, { controller: AbortController; messageId: string }> = new Map();

/**
 * Main Twilio webhook handler for incoming WhatsApp messages.
 * Handles message queuing, duplicate detection, and concurrency control.
 */
app.post('/twilio/', authenticateRequest, rateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.body.From;
    const messageId = req.body.MessageSid;
    logger.info({ userId, messageId }, 'Received incoming message');

    if (!userId || !messageId) {
      throw createError.badRequest('Missing required fields: userId or messageId');
    }

    const mk = getMessageKey(messageId);

    if (await redis.exists(mk) === 1) {
      logger.debug({ messageId }, 'Message already processed, skipping');
      return res.status(200).end();
    }

    await redis.hSet(mk, {
      userId,
      status: 'queued',
      createdAt: Date.now(),
    });
    await redis.expire(mk, MESSAGE_TTL_SECONDS);

    const uak = getUserActiveKey(userId);
    const currentActive = await redis.get(uak);
    const currentStatus = currentActive ? await redis.hGet(getMessageKey(currentActive), 'status') : null;
    const hasActiveRun = userControllers.has(userId);

    if (hasActiveRun && currentStatus === 'running') {
      const active = userControllers.get(userId);
      if (active) {
        active.controller.abort();
        logger.info({ userId, abortedMessageId: active.messageId }, 'Aborted previous message processing');
      }
    }

    if (currentStatus === 'sending') {
      const uqk = getUserQueueKey(userId);
      await redis.rPush(uqk, JSON.stringify({ messageId, input: req.body }));
      await redis.expire(uqk, USER_STATE_TTL_SECONDS);
      logger.debug({ messageId, userId }, 'Queued message due to active sending');
      return res.status(200).end();
    } else {
      await redis.set(uak, messageId, { EX: USER_STATE_TTL_SECONDS });
      processMessage(userId, messageId, req.body);
      return res.status(200).end();
    }
  } catch (err: any) {
    const messageId = req.body?.MessageSid;
    try {
      if (messageId) {
        const mk = getMessageKey(messageId);
        await redis.hSet(mk, { status: 'failed' });
      }
    } catch (redisErr: any) {
      logger.warn({ messageId, err: redisErr.message }, 'Failed to set failed status for message');
    }
    next(err);
  }
});

/**
 * Twilio callback handler for message delivery status updates.
 */
app.post('/twilio/callback/', authenticateRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    processStatusCallback(req.body || {});
    return res.status(200).end();
  } catch (err: any) {
    next(err);
  }
});

app.use(errorHandler);

/**
 * Processes a single message through the agent graph with concurrency control.
 * Manages message status, handles aborts, and processes queued messages.
 *
 * @param userId - The WhatsApp user ID
 * @param messageId - The Twilio message SID
 * @param input - The raw Twilio webhook payload
 */
async function processMessage(userId: string, messageId: string, input: Record<string, any>): Promise<void> {
  const controller = new AbortController();
  userControllers.set(userId, { controller, messageId });
  const mk = getMessageKey(messageId);

  try {
    await redis.hSet(mk, { status: 'running' });

    await runAgent(input, { signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.info({ userId, messageId }, 'Message processing aborted');
    }

    try {
      await redis.hSet(mk, { status: 'failed' });
    } catch (redisErr: any) {
      logger.error({ redisErr: redisErr.message, userId, messageId }, 'Failed to update message status in Redis');
    }
  } finally {
    const current = userControllers.get(userId);
    if (current && current.messageId === messageId) {
      userControllers.delete(userId);

      try {
        const uqk = getUserQueueKey(userId);
        const nextStr = await redis.lPop(uqk);
        if (nextStr) {
          const next = JSON.parse(nextStr);
          const uak = getUserActiveKey(userId);
          await redis.set(uak, next.messageId, { EX: USER_STATE_TTL_SECONDS });
          processMessage(userId, next.messageId, next.input);
        } else {
          const uak = getUserActiveKey(userId);
          await redis.del(uak);
        }
      } catch (queueErr: any) {
        logger.error({ userId, messageId, err: queueErr.message }, 'Failed to process message queue');
      }
    }
  }
}

/**
 * Bootstrap function to initialize the server and connect to services.
 * Sets up Redis connection and starts the Express server.
 */
void (async function bootstrap() {
  try {
    await connectRedis();
    const PORT = Number(process.env.PORT || 8080);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'Broadway WhatsApp Bot server started');
    });
  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, 'Server bootstrap failed');
    process.exit(1);
  }
})();
