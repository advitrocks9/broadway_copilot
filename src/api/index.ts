import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errors';
import { staticUploadsMount } from '../utils/paths';
import { validateTwilioRequest, processStatusCallback } from '../utils/twilioHelpers';
import { getLogger } from '../utils/logger';
import redis, { connectRedis } from '../lib/redis';
import prisma from '../lib/prisma';

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

/**
 * Handles Twilio webhooks, validates requests, and runs the agent.
 */
app.post('/twilio/', async (req, res) => {
  try {
    const isValid = validateTwilioRequest(req);
    if (!isValid) {
      return res.status(403).send('Forbidden');
    }

    
    logger.info('Webhook processed successfully');
    return res.status(200).end();
  } catch (err: any) {
    logger.error({
      message: err?.message,
      stack: err?.stack,
      body: req?.body,
      headers: req?.headers,
    }, 'Inbound webhook error');
    return res.status(500).end();
  }
});

app.post('/twilio/callback/', async (req, res) => {
  try {
    const isValid = validateTwilioRequest(req);
    if (!isValid) {
      return res.status(403).send('Forbidden');
    }

    processStatusCallback(req.body || {});
    return res.status(200).end();
  } catch (err: any) {
    logger.error({ message: err?.message, stack: err?.stack, body: req?.body }, 'Callback processing error');
    return res.status(500).end();
  }
});

app.use(errorHandler);

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
