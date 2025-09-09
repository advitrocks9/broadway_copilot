import { User } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { createError } from './errors';

/**
 * Gets or creates a user record for the given WhatsApp ID.
 * Uses upsert to ensure user exists without duplicating records.
 *
 * @param waId - WhatsApp user identifier (e.g., "whatsapp:+1234567890")
 * @returns User record from database
 * @throws {HttpError} When WhatsApp ID is missing or database operation fails
 */
export async function getUser(waId: string): Promise<User> {
  if (!waId) {
    throw createError.badRequest('WhatsApp ID is required');
  }

  try {
    const user = await prisma.user.upsert({
      where: { waId },
      create: { waId },
      update: {},
    });

    return user;

  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    throw createError.internalServerError('Failed to get or create user');
  }
}
