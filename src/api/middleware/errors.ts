import { NextFunction, Request, Response } from 'express';
import { errorHandler as appErrorHandler, AppError, createErrorResponse } from '../../utils/errors';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const context = {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  };

  const appError = appErrorHandler.handle(err, context);

  const statusCode = appError instanceof AppError ? appError.statusCode : 500;

  res.status(statusCode).json(createErrorResponse(appError));
}
