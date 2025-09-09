import { Request, Response, NextFunction } from 'express';

import { createError } from '../utils/errors';
import { logger }  from '../utils/logger';
import { validateTwilioRequest } from '../lib/twilio';

/**
 * Express middleware to authenticate incoming Twilio webhook requests.
 * Validates the request signature to ensure it originates from Twilio.
 *
 * @param req - Express request object containing webhook data
 * @param _res - Express response object (unused)
 * @param next - Express next function to continue request processing
 * @throws {HttpError} When webhook signature validation fails
 */
export const authenticateRequest = (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.body?.From;
  const messageId = req.body?.MessageSid;

  try {
    const isValid = validateTwilioRequest(req);
    if (!isValid) {
      logger.warn({ userId, messageId, ip: req.ip }, 'Twilio webhook authentication failed');
      throw createError.forbidden('Invalid webhook signature');
    }
    logger.debug({ userId, messageId }, 'Twilio webhook authentication successful');
    next();
  } catch (err: any) {
    logger.error({ userId, messageId, err: err?.message }, 'Twilio webhook authentication error');
    if (err.statusCode) {
      throw err; // Re-throw HTTP errors as-is
    }
    throw createError.forbidden('Authentication failed');
  }
};
