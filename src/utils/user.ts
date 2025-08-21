import prisma from '../db/client';
import { getLogger } from './logger';

/**
 * User helpers for fetching or creating users by WhatsApp ID.
 */
const logger = getLogger('utils:user');

export async function getOrCreateUserByWaId(waId: string) {
  const user = await prisma.user.upsert({
    where: { waId },
    create: { waId },
    update: {},
  });
  logger.info({ userId: user.id, waId }, 'Ensured user by waId');
  return user;
}
