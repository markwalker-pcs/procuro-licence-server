import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

prisma.$on('error', (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

prisma.$on('warn', (e: { message: string }) => {
  logger.warn('Prisma warning', { message: e.message });
});
