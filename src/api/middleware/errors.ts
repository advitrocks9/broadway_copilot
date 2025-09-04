import { NextFunction, Request, Response } from 'express';
import { errorHandler as appErrorHandler, AppError, createErrorResponse } from '../../utils/errors';

/**
 * Global Express error handling middleware using standardized error handling.
 */

/**
 * Express error handling middleware with standardized error processing.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const context = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  };

  const appError = appErrorHandler.handle(err, context);

  // If it's an AppError, use its status code, otherwise default to 500
  const statusCode = appError instanceof AppError ? appError.statusCode : 500;

  res.status(statusCode).json(createErrorResponse(appError));
}
