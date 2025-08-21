import pino, { Logger as PinoLogger } from 'pino';

/**
 * Centralized structured logger based on Pino.
 * - Pretty prints in development, JSON in production
 * - Supports module-scoped child loggers via getLogger(name)
 */
export type Logger = PinoLogger;

const isProduction = process.env.NODE_ENV === 'production';

function getTransport() {
  if (isProduction) return undefined as any;
  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: true,
      },
    } as any;
  } catch {
    return undefined as any;
  }
}

const baseLogger: PinoLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: getTransport(),
});

export function getLogger(moduleName?: string): Logger {
  return moduleName ? baseLogger.child({ module: moduleName }) : baseLogger;
}

export default baseLogger;


