import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errors';
import { staticUploadsMount } from '../utils/paths';
import { validateTwilioRequest } from '../services/twilioService';
import { runAgent } from '../agent/graph';

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
      console.warn('❌ [API_WEBHOOK] Invalid Twilio request signature', {
        url: fullUrl,
        hasSignature: Boolean(signature),
        contentType: req.headers['content-type'],
      });
      return res.status(403).send('Forbidden');
    }

    await runAgent(req.body || {});

    console.log('✅ [API_WEBHOOK] Webhook processed successfully');
    return res.status(200).end();
  } catch (err: any) {
    console.error('❌ [API_WEBHOOK] Inbound webhook error', {
      message: err?.message,
      stack: err?.stack,
      body: req?.body,
      headers: req?.headers,
    });
    return res.status(500).end();
  }
});

app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log('🚀 [SERVER] Broadway WhatsApp Bot server started!');
});
