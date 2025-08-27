import prisma from '../db/client';
import { getLogger } from '../utils/logger';

/**
 * Agent data helpers: recent turns, wardrobe, colors, and activity timestamps.
 */
const logger = getLogger('agent:tools');

export async function fetchRecentTurns(userId: string, limit = 6) {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const turns = await prisma.turn.findMany({
    where: { userId, createdAt: { gte: thirtyMinutesAgo } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, text: true, imagePath: true },
  });
  
  return turns
    .reverse()
    .filter(turn => turn.text && turn.text.trim())
    .map(turn => `${turn.role}: ${turn.text}`);
}

/**
 * Returns wardrobe items for a user.
 */
export async function queryWardrobe(userId: string) {
  const items = await prisma.wardrobeItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      name: true,
      category: true,
      colors: true,
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
    include: {
      color: {
        select: {
          palette_name: true,
          top3_colors: true,
          avoid3_colors: true,
          undertone: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  const raw = uploadsWithColor[0]?.color || null;
  const latest = raw
    ? {
        palette_name: raw.palette_name ?? null,
        top_3_colors: (raw as any).top3_colors ?? null,
        bottom_3_colors: (raw as any).avoid3_colors ?? null,
        undertone: raw.undertone ?? null,
      }
    : null;
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