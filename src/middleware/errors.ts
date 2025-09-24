import { NextFunction, Request, Response } from 'express';

import { createErrorResponse, logError } from '../utils/errors';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const context = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  };

  const httpError = logError(err, context);

  res.status(httpError.statusCode).json(createErrorResponse(httpError));
}
