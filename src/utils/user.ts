import { User } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { BadRequestError, InternalServerError } from './errors';

/**
 * Gets or creates a user record for the given WhatsApp ID.
 * Uses upsert to ensure user exists without duplicating records.
 *
 * @param whatsappId - WhatsApp user identifier (e.g., "whatsapp:+1234567890")
 * @param profileName - Whatsapp user profile name
 * @returns User record from database
 * @throws {HttpError} When WhatsApp ID is missing or database operation fails
 */
export async function getUser(whatsappId: string, profileName?: string): Promise<User> {
  if (!whatsappId) {
    throw new BadRequestError('WhatsApp ID is required');
  }

  try {
    const user = await prisma.user.upsert({
      where: { whatsappId },
      create: { whatsappId, profileName },
      update: {},
    });

    return user;

  } catch (err: unknown) {
    throw new InternalServerError('Failed to get or create user', { cause: err });
  }
}
