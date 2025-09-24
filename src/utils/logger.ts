import pino, { LoggerOptions } from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

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
