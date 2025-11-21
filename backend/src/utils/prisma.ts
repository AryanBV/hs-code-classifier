/**
 * Prisma Client Singleton
 * Prevents multiple instances of Prisma Client in development
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Initialize Prisma Client with logging
 */
const prismaClient = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// Prevent multiple instances in development (hot reload)
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prismaClient;
}

/**
 * Test database connection
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prismaClient.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to database');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await prismaClient.$disconnect();
  logger.info('Database disconnected');
}

// Export singleton instance
export const prisma = prismaClient;
