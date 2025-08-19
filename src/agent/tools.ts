import prisma from '../db/client';

export async function fetchRecentTurns(userId: string, limit = 12) {
  const turns = await prisma.turn.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, text: true, imagePath: true, createdAt: true },
  });
  return turns.reverse();
}

/**
 * Returns wardrobe items for a user.
 */
export async function queryWardrobe(userId: string) {
  const items = await prisma.wardrobeItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      category: true,
      colors: true,
      type: true,
      subtype: true,
      attributes: true,
      createdAt: true,
    },
  });
  return { items };
}

/**
 * Returns the latest color analysis for a user, if any.
 */
export async function queryColors(userId: string) {
  const uploadsWithColor = await prisma.upload.findMany({
    where: { userId, color: { isNot: null } },
    include: { color: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const latest = uploadsWithColor[0]?.color || null;
  return { latestColorAnalysis: latest };
}

/**
 * Builds a compact transcript of the last 6 user and 6 assistant messages.
 */
export {}
