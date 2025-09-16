import { PrismaClient, Prisma } from "@prisma/client";

import { logger } from "../utils/logger";

/**
 * Global Prisma client instance for database operations.
 * Uses singleton pattern to prevent connection leaks in development.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Prisma database client configured with error and warning event logging.
 * Singleton pattern prevents multiple connections during hot reloading in development.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Log Prisma events
(prisma as any).$on("error", (e: Prisma.LogEvent) => {
  logger.error({ target: e.target, message: e.message }, "Database error");
});

(prisma as any).$on("warn", (e: Prisma.LogEvent) => {
  logger.warn({ message: e.message }, "Database warning");
});

/**
 * Connects to the database and logs the outcome.
 * Should be called at application startup to proactively initialize the connection pool.
 * @throws {Error} If the connection fails.
 */
export async function connectPrisma() {
  try {
    await prisma.$connect();
    logger.info("Successfully connected to the database");
  } catch (err: any) {
    logger.error(
      { err: err.message, stack: err.stack },
      "Failed to connect to the database",
    );
    throw err;
  }
}
