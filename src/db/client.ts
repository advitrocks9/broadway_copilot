import { PrismaClient } from '@prisma/client';
import { getLogger } from '../utils/logger';

/**
 * Singleton Prisma client for database access across the app lifecycle.
 */
const logger = getLogger('db:client');

let prisma: PrismaClient;

declare global {
  var __prisma__: PrismaClient | undefined;
}

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prisma__) {
    global.__prisma__ = new PrismaClient();
  }
  prisma = global.__prisma__;
}

export default prisma;
