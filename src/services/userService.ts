import prisma from '../db/client';

export type AgentIntent = 'small_talk' | 'rate_outfit' | 'color_analysis' | 'suggest_outfit' | 'fallback';

export async function getOrCreateUserByWaId(waId: string) {
  return prisma.user.upsert({
    where: { waId },
    create: { waId },
    update: {},
  });
}
