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

/**
 * Express API entrypoint for Broadway WhatsApp Bot server.
 */
const logger = getLogger('api');
const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/], credentials: true }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/uploads', express.static(staticUploadsMount()));

const userControllers: Map<string, { controller: AbortController; messageId: string }> = new Map();

/**
 * Handles Twilio webhooks, validates requests, and runs the agent.
 */
app.post('/twilio/', authenticateRequest, rateLimiter, async (req, res) => {
  try {

    const userId = req.body.From;
    const messageId = req.body.MessageSid;
    if (!userId || !messageId) {
      return res.status(400).end();
    }

    const messageKey = `message:${messageId}`;
    if (await redis.exists(messageKey) === 1) {
      return res.status(200).end();
    }

    await redis.hSet(messageKey, {
      userId,
      status: 'queued',
      createdAt: Date.now(),
    });

    const userActiveKey = `user_active:${userId}`;
    const currentActive = await redis.get(userActiveKey);
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
      logger.info(`Message ${messageId} queued in Redis for user ${userId} because sending in progress`);
      return res.status(200).end();
    } else {
      await redis.set(userActiveKey, messageId);
      processMessage(userId, messageId, req.body);
      return res.status(200).end();
    }
  } catch (err: any) {
    logger.error({
      message: err?.message,
      stack: err?.stack,
      body: req?.body,
      headers: req?.headers,
    }, 'Inbound webhook error');
    // Attempt to set failed if messageKey was created
    const messageId = req.body.MessageSid;
    if (messageId) {
      const messageKey = `message:${messageId}`;
      await redis.hSet(messageKey, { status: 'failed' });
    }
    return res.status(500).end();
  }
});

app.post('/twilio/callback/', authenticateRequest, async (req, res) => {
  try {
    processStatusCallback(req.body || {});
    return res.status(200).end();
  } catch (err: any) {
    logger.error({ message: err?.message, stack: err?.stack, body: req?.body }, 'Callback processing error');
    return res.status(500).end();
  }
});

app.use(errorHandler);

/**
 * Processes a message for a user, handling execution, status updates, and queue processing.
 */
async function processMessage(userId: string, messageId: string, input: Record<string, any>): Promise<void> {
  const controller = new AbortController();
  userControllers.set(userId, { controller, messageId });

  const messageKey = `message:${messageId}`;
  await redis.hSet(messageKey, { status: 'running' });

  try {
    await runAgent(input, { signal: controller.signal });
    await redis.hSet(messageKey, { status: 'delivered' });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.info(`Run for message ${messageId} aborted`);
    } else {
      logger.error(err, `Run for message ${messageId} failed`);
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
        await redis.set(userActiveKey, next.messageId);
        processMessage(userId, next.messageId, next.input);
      } else {
        const userActiveKey = `user_active:${userId}`;
        await redis.del(userActiveKey);
      }
    }
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received, closing…`);
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
});
