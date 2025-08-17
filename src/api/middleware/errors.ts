import { NextFunction, Request, Response } from 'express';

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
    console.error('Express error handler:', { status, message, stack, err });
  } catch (_) {
    // no-op
  }
  res.status(status).json({ error: { status, message } });
}
