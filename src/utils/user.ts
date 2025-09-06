import prisma from '../lib/prisma';

export async function getOrCreateUserByWaId(waId: string) {
  const user = await prisma.user.upsert({
    where: { waId },
    create: { waId },
    update: {},
  });
  return user;
}
