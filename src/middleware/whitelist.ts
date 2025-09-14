import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { TwilioWebhookRequest } from '../lib/twilio/types';
import { ForbiddenError, InternalServerError } from '../utils/errors';

export const whitelist = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
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
      return next(new ForbiddenError('Unauthorized'));
    }

    next();
  } catch (error) {
    next(new InternalServerError('Internal Server Error'));
  }
};
