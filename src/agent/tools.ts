import { prisma } from '../lib/prisma';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { OpenAIEmbeddings } from '@langchain/openai';

const searchWardrobeSchema = z.object({
  userId: z.string(),
  query: z.array(z.string()),
});

export const searchWardrobe = new DynamicStructuredTool({
  name: 'searchWardrobe',
  description: "Performs a vector search on the user's wardrobe",
  schema: searchWardrobeSchema,
  func: async ({ userId, query }: z.infer<typeof searchWardrobeSchema>) => {
    let result = {};
    const model = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
    });
    const embeddedQuery = await model.embedDocuments(query);

    result = await prisma.$queryRaw`
      SELECT name, category, colors, type, subtype, attributes FROM WardrobeItem
      WHERE embedding IS NOT NULL AND userId = ${userId}
      ORDER BY embedding <=> ${embeddedQuery}
      LIMIT 20
    `;
    
    return result;
  },
});


const fetchColorAnalysisSchema = z.object({
  userId: z.string(),
});

export const fetchColorAnalysis = new DynamicStructuredTool({
  name: 'fetchColorAnalysis',
  description: "Fetches the users latest color analysis data.",
  schema: fetchColorAnalysisSchema,
  func: async ({ userId }: z.infer<typeof fetchColorAnalysisSchema>) => {
    const result = await prisma.colorAnalysis.findFirst({
      select: {
        palette_name: true,
        top3_colors: true,
        avoid3_colors: true,
        undertone: true,
      },
      where: { message: { userId: userId } },
      orderBy: { createdAt: 'desc' },
    });
    return result;
  },
});


const fetchRelevantMemoriesSchema = z.object({
  userId: z.string().describe('The user ID to fetch memories for'),
  query: z.string().describe('The semantic query to find relevant memories'),
});

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

export const fetchRelevantMemories = new DynamicStructuredTool({
  name: 'fetchRelevantMemories',
  description: 'Fetches relevant memories for the user based on semantic similarity to the query.',
  schema: fetchRelevantMemoriesSchema,
  func: async ({ userId, query }: z.infer<typeof fetchRelevantMemoriesSchema>) => {
    const memories = await prisma.memory.findMany({
      where: { userId },
      select: { id: true, category: true, key: true, value: true, confidence: true, updatedAt: true },
    });
    if (memories.length === 0) return [];
    const model = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });
    const texts = memories.map((m: any) => `${m.category}: ${m.key} = ${m.value}`);
    const [embeddings, queryEmb] = await Promise.all([
      model.embedDocuments(texts),
      model.embedQuery(query),
    ]);
    const similarities = embeddings.map((emb, i) => ({
      index: i,
      sim: cosineSimilarity(emb, queryEmb),
    })).sort((a, b) => b.sim - a.sim);
    const top = similarities.slice(0, 5).map(s => memories[s.index]);
    return top;
  },
});

