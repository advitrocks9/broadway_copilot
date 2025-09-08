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
 * Standardized error handler for consistent error processing.
 */
class ErrorHandler {
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
