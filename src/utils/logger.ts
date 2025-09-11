import pino from 'pino';

/**
 * Determines if the application is running in development mode.
 * Controls logger configuration for better debugging experience.
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Centralized logger instance using Pino with environment-specific configuration.
 * Uses pretty printing in development for better readability, JSON in production.
 */
export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});
