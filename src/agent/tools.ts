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


// Tool 1: Query the user's wardrobe items as JSON
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

// Tool 2: Query the user's latest color analysis as JSON (if any)
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

// Tool 3: Fetch latest conversation messages for model consumption.
export async function fetchLatestConversationMessages(userId: string) {
  const recent = await prisma.turn.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { role: true, text: true, imagePath: true, fileId: true, createdAt: true, intent: true },
  });

  const collected: Array<any> = [];
  let userCount = 0;
  let assistantCount = 0;

  for (const t of recent) {
    if (t.role === 'user') {
      if (userCount >= 6) continue;
      userCount += 1;
      if (t.fileId) {
        collected.push({
          role: 'user',
          content: [
            ...(t.text ? [{ type: 'input_text', text: t.text }] : []),
            { type: 'input_image', file_id: t.fileId, detail: 'high' },
          ],
          intent: t.intent || null,
          createdAt: t.createdAt,
        });
      } else {
        collected.push({ role: 'user', content: t.text || '', intent: t.intent || null, createdAt: t.createdAt });
      }
    } else if (t.role === 'assistant') {
      if (assistantCount >= 6) continue;
      assistantCount += 1;
      collected.push({ role: 'assistant', content: t.text || '', intent: t.intent || null, createdAt: t.createdAt });
    }
    if (userCount >= 6 && assistantCount >= 6) break;
  }

  // Sort chronologically before returning
  collected.sort((a, b) => new Date(a.createdAt as Date).getTime() - new Date(b.createdAt as Date).getTime());
  // Strip createdAt from final payload to keep it model-ready
  const messages = collected.map(({ createdAt: _c, ...rest }) => rest);
  return { messages };
}
