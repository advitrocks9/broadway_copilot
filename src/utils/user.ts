import prisma from '../db/client';

export async function getOrCreateUserByWaId(waId: string) {
  return prisma.user.upsert({
    where: { waId },
    create: { waId },
    update: {},
  });
}
