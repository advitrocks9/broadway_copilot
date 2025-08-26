import { NextFunction, Request, Response } from 'express';
import { getLogger } from '../../utils/logger';

/**
 * Global Express error handling middleware.
 */
const logger = getLogger('api:errors');

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  try {
    const stack = err?.stack || '';
    logger.error({ status, message, stack, err }, 'Express error handler');
  } catch (_) {}
  res.status(status).json({ error: { status, message } });
}
