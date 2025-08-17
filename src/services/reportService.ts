import prisma from '../db/client';

export async function weekly(userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  return forRange(userId, since, new Date());
}

export async function forRange(userId: string, start: Date, end: Date) {
  const uploads = await prisma.upload.findMany({
    where: { userId, createdAt: { gte: start, lte: end } },
    include: { vibeCheck: true, color: true },
    orderBy: { createdAt: 'asc' },
  });

  const scores = uploads
    .map((u: any) => u.vibeCheck?.overall_score)
    .filter((s: any): s is number => typeof s === 'number');
  const avgScore = scores.length ? Number((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2)) : null;

  let best: { date: string; score: number } | null = null;
  let worst: { date: string; score: number } | null = null;
  for (const u of uploads) {
    if (typeof u.vibeCheck?.overall_score === 'number') {
      const dt = u.createdAt.toISOString();
      if (!best || u.vibeCheck.overall_score > best.score) best = { date: dt, score: u.vibeCheck.overall_score };
      if (!worst || u.vibeCheck.overall_score < worst.score) worst = { date: dt, score: u.vibeCheck.overall_score };
    }
  }

  const colorCounts: Record<string, number> = {};
  for (const u of uploads) {
    const tones = (u.color?.top3_colors as unknown as string[] | undefined) || [];
    for (const c of tones) colorCounts[c] = (colorCounts[c] || 0) + 1;
  }
  const topColors = (Object.entries(colorCounts) as Array<[string, number]>)
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const uniqueOutfits = uploads.length;
  const uniqueItems = await prisma.wardrobeItem.count({ where: { userId } });

  const blurb =
    avgScore === null
      ? 'Not enough data yet. Upload some outfits!'
      : avgScore >= 7
      ? 'Strong week overall — keep the momentum.'
      : 'Room to experiment — try mixing in new colors or patterns.';

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    metrics: { avgScore, best, worst, topColors, uniqueOutfits, uniqueItems },
    blurb,
  };
}
