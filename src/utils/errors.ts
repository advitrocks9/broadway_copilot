import { logger } from "./logger";

/**
 * Simple error handling system for the Broadway Copilot application.
 * Uses standard Error objects with HTTP status codes.
 */

/**
 * Extended Error class that includes HTTP status code.
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(
    message: string,
    statusCode: number = 500,
    options?: { cause?: any },
  ) {
    super(message, options);
    this.statusCode = statusCode;
    this.name = "HttpError";
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * A collection of specific HTTP error classes for different status codes.
 */
export class BadRequestError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 400, options);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 401, options);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 403, options);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 404, options);
    this.name = "NotFoundError";
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 429, options);
    this.name = "TooManyRequestsError";
  }
}

export class InternalServerError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 500, options);
    this.name = "InternalServerError";
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 503, options);
    this.name = "ServiceUnavailableError";
  }
}

export class GatewayTimeoutError extends HttpError {
  constructor(message: string, options?: { cause?: any }) {
    super(message, 504, options);
    this.name = "GatewayTimeoutError";
  }
}

/**
 * Logs an error with consistent formatting, automatically normalizing unknown error types.
 * @param error The error to log (can be any error type, will be normalized internally).
 * @param context Additional context about where the error occurred.
 * @returns The normalized HttpError for further use if needed.
 */
export function logError(
  error: unknown,
  context?: Record<string, unknown>,
): HttpError {
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
    logger.error(logData, "System error");
  } else {
    logger.warn(logData, "Client error");
  }

  return httpError;
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
    return new InternalServerError(error.message || "Unknown error occurred", {
      cause: error,
    });
  }

  return new InternalServerError("An unknown error occurred");
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
