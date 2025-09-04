import { Request, Response, NextFunction } from 'express';
import { validateTwilioRequest } from '../../utils/twilioHelpers';

/**
 * Middleware to authenticate if a request is coming from Twilio.
 * @param req - Express request object.
 * @param res - Express response object.
 * @param next - Express next function.
 */
export const authenticateRequest = (req: Request, res: Response, next: NextFunction) => {
  const isValid = validateTwilioRequest(req);
  if (!isValid) {
    return res.status(403).send('Forbidden');
  }
  next();
};
