import { logger } from './logger';

/**
 * Simple error handling system for the Broadway Copilot application.
 * Uses standard Error objects with HTTP status codes.
 */

/**
 * Extended Error class that includes HTTP status code.
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500, options?: { cause?: any }) {
    super(message, options);
    this.statusCode = statusCode;
    this.name = 'HttpError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Utility functions to create errors with specific HTTP status codes.
 */
export const createError = {
  badRequest: (message: string, options?: { cause?: any }) => new HttpError(message, 400, options),
  unauthorized: (message: string, options?: { cause?: any }) => new HttpError(message, 401, options),
  forbidden: (message: string, options?: { cause?: any }) => new HttpError(message, 403, options),
  notFound: (message: string, options?: { cause?: any }) => new HttpError(message, 404, options),
  internalServerError: (message: string, options?: { cause?: any }) => new HttpError(message, 500, options),
  serviceUnavailable: (message: string, options?: { cause?: any }) => new HttpError(message, 503, options),
};

/**
 * Logs an HttpError with consistent formatting.
 * @param error The error to log.
 * @param context Additional context about where the error occurred.
 */
export function logError(error: HttpError, context?: Record<string, unknown>): void {
  const logData = {
    statusCode: error.statusCode,
    message: error.message,
    stack: error.stack,
    cause: error.cause ? (error.cause instanceof Error ? { message: error.cause.message, stack: error.cause.stack } : String(error.cause)) : undefined,
    ...context,
  };

  if (error.statusCode >= 500) {
    logger.error(logData, 'System error');
  } else {
    logger.warn(logData, 'Client error');
  }
}

/**
 * Normalizes an unknown error into an HttpError.
 * This ensures that any thrown value is handled consistently.
 * @param error The error to normalize.
 * @returns An HttpError instance.
 */
export function normalizeError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error) {
    return new HttpError(error.message || 'Unknown error occurred', 500, { cause: error });
  }

  return new HttpError('An unknown error occurred', 500);
}

/**
 * Utility function to create standardized error responses.
 */
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
