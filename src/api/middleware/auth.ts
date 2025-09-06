import { Request, Response, NextFunction } from 'express';
import { validateTwilioRequest } from '../../utils/twilioHelpers';
import { getLogger } from '../../utils/logger';

const logger = getLogger('middleware:auth');

export const authenticateRequest = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.body?.From;
  const messageId = req.body?.MessageSid;

  try {
    const isValid = validateTwilioRequest(req);
    if (!isValid) {
      logger.warn({ userId, messageId, ip: req.ip }, 'Twilio webhook authentication failed');
      return res.status(403).send('Forbidden');
    }
    logger.debug({ userId, messageId }, 'Twilio webhook authentication successful');
    next();
  } catch (err: any) {
    logger.error({ userId, messageId, err: err?.message }, 'Twilio webhook authentication error');
    return res.status(403).send('Forbidden');
  }
};
