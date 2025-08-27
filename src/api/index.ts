import 'dotenv/config';
import { ValidationUtils } from '../utils/validation';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errors';
import { staticUploadsMount } from '../utils/paths';
import { sendText } from '../services/twilioService';
import { validateTwilioRequest, processStatusCallback } from '../utils/twilioHelpers';
import { orchestrateInbound } from '../services/orchestrator';
import { getLogger } from '../utils/logger';

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
    const signature = req.header('X-Twilio-Signature') || req.header('x-twilio-signature');
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.get('host') as string);
    const fullUrl = `${protoHeader}://${hostHeader}${req.originalUrl}`;
    
    const isValid = validateTwilioRequest(fullUrl, req.body || {}, signature || undefined);
    if (!isValid) {
      logger.warn({
        url: fullUrl,
        hasSignature: Boolean(signature),
        contentType: req.headers['content-type'],
      }, 'Invalid Twilio request signature');
      return res.status(403).send('Forbidden');
    }

    // Validate webhook payload
    const validatedBody = ValidationUtils.validateTwilioWebhook(req.body);

    // Validate message content if present
    if (validatedBody.Body) {
      const contentValidation = ValidationUtils.validateMessageContent(validatedBody.Body);
      if (!contentValidation.isValid) {
        logger.warn({
          body: validatedBody,
          reason: contentValidation.reason
        }, 'Invalid message content');
        sendText(validatedBody.From || 'unknown', contentValidation.reason || 'Invalid message');
        return res.status(200).end();
      }
    }

    await orchestrateInbound({ body: validatedBody });

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
    const signature = req.header('X-Twilio-Signature') || req.header('x-twilio-signature');
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.get('host') as string);
    const fullUrl = `${protoHeader}://${hostHeader}${req.originalUrl}`;

    const isValid = validateTwilioRequest(fullUrl, req.body || {}, signature || undefined);
    if (!isValid) {
      logger.warn({ url: fullUrl, hasSignature: Boolean(signature) }, 'Invalid Twilio callback signature');
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

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', async () => {
  logger.info({ port: PORT }, 'Broadway WhatsApp Bot server started');
});
