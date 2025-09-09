import { z } from 'zod';

import { DynamicStructuredTool } from '@langchain/core/tools';
import { OpenAIEmbeddings } from '@langchain/openai';

import { prisma } from '../lib/prisma';
import { createError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Schema for wardrobe search tool parameters.
 */
const searchWardrobeSchema = z.object({
  userId: z.string(),
  query: z.array(z.string()),
});

/**
 * Dynamic tool for searching user wardrobe using vector similarity.
 * Combines results from multiple queries to find relevant clothing items.
 */
export const searchWardrobe = new DynamicStructuredTool({
  name: 'searchWardrobe',
  description: "Performs vector searches on the user's wardrobe for each query and returns combined unique results",
  schema: searchWardrobeSchema,
  func: async ({ userId, query }: z.infer<typeof searchWardrobeSchema>) => {
    if (!userId) {
      throw createError.badRequest('User ID is required');
    }

    if (!query || query.length === 0) {
      throw createError.badRequest('Search query is required');
    }

    try {
      const model = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
      });

      const resultsMap = new Map<string, any>();

      for (const q of query) {
        const embedded = await model.embedQuery(q);
        const vector = JSON.stringify(embedded);

        const res: any[] = await prisma.$queryRaw`
          SELECT id, name, category, colors, type, subtype, attributes FROM "WardrobeItem"
          WHERE "embedding" IS NOT NULL AND "userId" = ${userId}
          ORDER BY "embedding" <=> ${vector}::vector
          LIMIT 20
        `;

        for (const item of res) {
          const { id, ...rest } = item;
          if (!resultsMap.has(id)) {
            resultsMap.set(id, rest);
          }
        }
      }

      return Array.from(resultsMap.values());
    } catch (err: unknown) {
      logger.error({ userId, query, err: (err as Error)?.message }, 'Failed to search wardrobe');
      if ((err as any).statusCode) {
        throw err;
      }
      throw createError.internalServerError('Failed to search wardrobe', { cause: err });
    }
  },
});

/**
 * Schema for color analysis fetch tool parameters.
 */
const fetchColorAnalysisSchema = z.object({
  userId: z.string(),
});

/**
 * Dynamic tool for retrieving user's latest color analysis results.
 * Provides color palette information, undertone analysis, and color recommendations.
 */
export const fetchColorAnalysis = new DynamicStructuredTool({
  name: 'fetchColorAnalysis',
  description: "Fetches the user's latest color analysis data",
  schema: fetchColorAnalysisSchema,
  func: async ({ userId }: z.infer<typeof fetchColorAnalysisSchema>) => {
    if (!userId) {
      throw createError.badRequest('User ID is required');
    }

    try {
      const result = await prisma.colorAnalysis.findFirst({
        select: {
          palette_name: true,
          top3_colors: true,
          avoid3_colors: true,
          undertone: true,
        },
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return result;
    } catch (err: unknown) {
      logger.error({ userId, err: (err as Error)?.message }, 'Failed to fetch color analysis');
      if ((err as any).statusCode) {
        throw err;
      }
      throw createError.internalServerError('Failed to fetch color analysis', { cause: err });
    }
  },
});

/**
 * Schema for memory fetch tool parameters.
 */
const fetchRelevantMemoriesSchema = z.object({
  userId: z.string().describe('The user ID to fetch memories for'),
  query: z.string().describe('The semantic query to find relevant memories'),
});

/**
 * Type definition for memory items stored in the database.
 */
type MemoryItem = {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number | null;
  updatedAt: Date;
};

/**
 * Calculates cosine similarity between two vectors.
 * Used for ranking memory relevance based on semantic similarity.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between 0 and 1
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

/**
 * Dynamic tool for retrieving user memories using semantic similarity search.
 * Ranks memories by relevance to the query using vector embeddings and cosine similarity.
 */
export const fetchRelevantMemories = new DynamicStructuredTool({
  name: 'fetchRelevantMemories',
  description: 'Fetches relevant memories for the user based on semantic similarity to the query.',
  schema: fetchRelevantMemoriesSchema,
  func: async ({ userId, query }: z.infer<typeof fetchRelevantMemoriesSchema>) => {
    if (!userId) {
      throw createError.badRequest('User ID is required');
    }

    if (!query) {
      throw createError.badRequest('Query is required');
    }

    try {
      const memories: MemoryItem[] = await prisma.memory.findMany({
        where: { userId },
        select: { id: true, category: true, key: true, value: true, confidence: true, updatedAt: true },
      });
      if (memories.length === 0) return [];
      const model = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });
      const texts = memories.map(m => `${m.category}: ${m.key} = ${m.value}`);
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
    } catch (err: unknown) {
      logger.error({ userId, query, err: (err as Error)?.message }, 'Failed to fetch relevant memories');
      if ((err as any).statusCode) {
        throw err;
      }
      throw createError.internalServerError('Failed to fetch relevant memories', { cause: err });
    }
  },
});

