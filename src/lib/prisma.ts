import { PrismaClient } from '@prisma/client';
import { getLogger } from '../utils/logger';

const logger = getLogger('lib:prisma');
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Log Prisma events
(prisma as any).$on('query', (e: any) => {
  logger.debug({ query: e.query, duration: e.duration }, 'Database query executed');
});

(prisma as any).$on('error', (e: any) => {
  logger.error({ target: e.target, message: e.message }, 'Database error');
});

(prisma as any).$on('warn', (e: any) => {
  logger.warn({ message: e.message }, 'Database warning');
});

logger.info('Prisma client initialized');

export default prisma;
