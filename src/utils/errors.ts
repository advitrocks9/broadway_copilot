import { getLogger } from './logger';

/**
 * Standardized error types for the Broadway Copilot application.
 */

/**
 * Base application error class with consistent structure.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for invalid input data.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

/**
 * Not found error for missing resources.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, details?: Record<string, unknown>) {
    super(`${resource} not found`, 'NOT_FOUND', 404, true, details);
  }
}

/**
 * External service error for third-party API failures.
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`${service}: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, true, details);
  }
}

/**
 * Database operation error.
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, false, details);
  }
}

/**
 * Rate limiting error.
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, details);
  }
}

/**
 * Authentication/Authorization error.
 */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', 401, true, details);
  }
}

/**
 * Standardized error handler for consistent error processing.
 */
export class ErrorHandler {
  private logger = getLogger('utils:errors');

  /**
   * Handles errors consistently across the application.
   * @param error - The error to handle
   * @param context - Additional context about where the error occurred
   * @returns Standardized error response
   */
  handle(error: unknown, context?: Record<string, unknown>): AppError {
    if (error instanceof AppError) {
      this.logError(error, context);
      return error;
    }

    if (error instanceof Error) {
      const appError = new AppError(
        error.message || 'Unknown error occurred',
        'INTERNAL_ERROR',
        500,
        false,
        { originalStack: error.stack }
      );
      this.logError(appError, context);
      return appError;
    }

    const unknownError = new AppError(
      'An unknown error occurred',
      'UNKNOWN_ERROR',
      500,
      false,
      { originalError: error }
    );
    this.logError(unknownError, context);
    return unknownError;
  }

  /**
   * Logs errors with consistent formatting.
   */
  private logError(error: AppError, context?: Record<string, unknown>): void {
    const logData = {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      isOperational: error.isOperational,
      details: error.details,
      stack: error.stack,
      ...context,
    };

    if (error.isOperational) {
      this.logger.warn(logData, 'Operational error');
    } else {
      this.logger.error(logData, 'System error');
    }
  }
}

/**
 * Global error handler instance.
 */
export const errorHandler = new ErrorHandler();

/**
 * Utility function to create standardized error responses.
 */
export function createErrorResponse(error: AppError): {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
  };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      ...(error.details && { details: error.details }),
    },
  };
}
