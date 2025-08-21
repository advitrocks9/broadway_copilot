import prisma from '../db/client';
import { getLogger } from '../utils/logger';

/**
 * Agent data helpers: recent turns, wardrobe, colors, and activity timestamps.
 */
const logger = getLogger('agent:tools');

export async function fetchRecentTurns(userId: string, limit = 12) {
  const turns = await prisma.turn.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, text: true, imagePath: true, createdAt: true, metadata: true },
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

export async function queryActivityTimestamps(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastVibeCheckAt: true, lastColorAnalysisAt: true },
  });
  const now = Date.now();
  const hoursAgo = (d: Date | null | undefined) =>
    d ? Math.floor((now - new Date(d).getTime()) / (1000 * 60 * 60)) : null;
  const vibeCheckHoursAgo = hoursAgo(user?.lastVibeCheckAt ?? null);
  const colorAnalysisHoursAgo = hoursAgo(user?.lastColorAnalysisAt ?? null);
  return {
    lastVibeCheckAt: user?.lastVibeCheckAt ?? null,
    lastColorAnalysisAt: user?.lastColorAnalysisAt ?? null,
    vibeCheckHoursAgo,
    colorAnalysisHoursAgo,
  };
}

/**
 * Builds a compact transcript of the last 6 user and 6 assistant messages.
 */
export {}
