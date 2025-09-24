import { logger } from './logger';

export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500, options?: { cause?: unknown }) {
    super(message, options);
    this.statusCode = statusCode;
    this.name = 'HttpError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 400, options);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 401, options);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 403, options);
    this.name = 'ForbiddenError';
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 500, options);
    this.name = 'InternalServerError';
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 503, options);
    this.name = 'ServiceUnavailableError';
  }
}

export function logError(error: unknown, context?: Record<string, unknown>): HttpError {
  const httpError = normalizeError(error);

  const logData = {
    statusCode: httpError.statusCode,
    message: httpError.message,
    stack: httpError.stack,
    cause: httpError.cause
      ? httpError.cause instanceof Error
        ? { message: httpError.cause.message, stack: httpError.cause.stack }
        : String(httpError.cause)
      : undefined,
    ...context,
  };

  if (httpError.statusCode >= 500) {
    logger.error(logData, 'System error');
  } else {
    logger.warn(logData, 'Client error');
  }

  return httpError;
}

export function normalizeError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message || 'Unknown error occurred', {
      cause: error,
    });
  }

  return new InternalServerError('An unknown error occurred');
}

export function createErrorResponse(error: HttpError): {
  error: {
    message: string;
    statusCode: number;
  };
} {
  return {
    error: {
      message: error.message,
      statusCode: error.statusCode,
    },
  };
}
