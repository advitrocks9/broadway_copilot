import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { sendText } from '../lib/twilio';
import { TwilioWebhookRequest } from '../lib/twilio/types';
import { ForbiddenError, InternalServerError } from '../utils/errors';
import { logger } from '../utils/logger';

export const whitelist = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const { WaId } = req.body as TwilioWebhookRequest;

  if (!WaId) {
    return next(new ForbiddenError('Unauthorized'));
  }

  try {
    const user = await prisma.userWhitelist.findUnique({
      where: {
        waId: WaId,
      },
    });

    if (!user) {
      logger.info(`Unauthorized access attempt by ${WaId}`);
      await sendText(
        WaId,
        "Hey! Thanks for your interest in Broadway. We're currently in a private beta. We'll let you know when we're ready for you!",
      );
      return res.status(403).send('Forbidden');
    }

    next();
  } catch (error: unknown) {
    logger.error({ error }, 'Error in whitelist middleware');
    next(new InternalServerError('Internal Server Error'));
  }
};
