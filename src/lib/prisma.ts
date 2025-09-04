import { PrismaClient } from '@prisma/client';

/**
 * Global variable to cache the PrismaClient instance.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Singleton PrismaClient instance.
 * In production, creates a new instance.
 * In development, reuses the cached instance to prevent connection exhaustion.
 */
export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
