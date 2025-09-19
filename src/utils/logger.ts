import pino, { LoggerOptions } from 'pino';

/**
 * Determines if the application is running in development mode.
 * Controls logger configuration for better debugging experience.
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Centralized logger instance using Pino with environment-specific configuration.
 * Uses pretty printing in development for better readability, JSON in production.
 */
const loggerOptions: LoggerOptions = {
  level: isDevelopment ? 'debug' : 'info',
};

if (isDevelopment) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  };
}

export const logger = pino(loggerOptions);
