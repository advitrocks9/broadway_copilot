import { Request, Response, NextFunction } from 'express';

import { ForbiddenError } from '../utils/errors';
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
  const twilioSignature = req.header('X-Twilio-Signature');

  if (!twilioSignature) {
    throw new ForbiddenError('Authentication failed');
  }

  try {
    const isValid = validateTwilioRequest(req);
    if (!isValid) {
      throw new ForbiddenError('Invalid webhook signature');
    }
    next();
  } catch (err: unknown) {
    throw new ForbiddenError('Authentication failed', { cause: err });
  }
};
