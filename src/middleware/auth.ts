import { NextFunction, Request, Response } from 'express';

import { validateTwilioRequest } from '../lib/twilio';
import { ForbiddenError } from '../utils/errors';

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
