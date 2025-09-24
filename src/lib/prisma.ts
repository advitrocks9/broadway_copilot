/**
 * @module prisma
 * @description Database client module providing a singleton Prisma instance with connection
 * management and event logging. Uses a global reference to prevent connection leaks during
 * hot reloading in development.
 */

import { Prisma, PrismaClient } from '@prisma/client';

import { logger } from '../utils/logger';

// Singleton to prevent connection leaks during hot reload
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const registerLogHandler = prisma.$on.bind(prisma) as (
  eventType: 'warn' | 'error',
  callback: (event: Prisma.LogEvent) => void,
) => PrismaClient;

registerLogHandler('error', (e: Prisma.LogEvent) => {
  logger.error({ target: e.target, message: e.message }, 'Database error');
});

registerLogHandler('warn', (e: Prisma.LogEvent) => {
  logger.warn({ message: e.message }, 'Database warning');
});

export async function connectPrisma() {
  try {
    await prisma.$connect();
    logger.info('Successfully connected to the database');
  } catch (err: unknown) {
    logger.error(
      {
        err: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      },
      'Failed to connect to the database',
    );
    throw err;
  }
}
