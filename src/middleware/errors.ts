import { NextFunction, Request, Response } from 'express';

import { createErrorResponse, logError, normalizeError } from '../utils/errors';

/**
 * Express error handling middleware that normalizes, logs, and responds to errors.
 * Final error handler in the middleware chain that ensures consistent error responses.
 *
 * @param err - The error that occurred during request processing
 * @param req - Express request object
 * @param res - Express response object
 * @param _next - Express next function (unused as this is the final handler)
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const context = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  };

  const httpError = normalizeError(err);
  logError(httpError, context);

  res.status(httpError.statusCode).json(createErrorResponse(httpError));
}
