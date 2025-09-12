import { z } from 'zod';

import { Tool } from '../lib/ai';
import { OpenAIEmbeddings } from '../lib/ai';

import { prisma } from '../lib/prisma';
import { createError } from '../utils/errors';
import { logger } from '../utils/logger';


/**
 * Dynamic tool for searching user wardrobe using vector similarity.
 * Combines results from multiple queries to find relevant clothing items.
 */
export function searchWardrobe(userId: string): Tool {
    
  const searchWardrobeSchema = z.object({
    query: z.array(z.string()).describe("A list of natural language queries to search for clothing items. Each query should describe an item of clothing."),
  });

  return new Tool({
    name: 'searchWardrobe',
    description: "Searches the user's digital wardrobe for clothing items based on a list of descriptive queries. Useful for finding specific items (e.g., 'red summer dress') or items for an outfit (e.g., ['white t-shirt', 'blue jeans']). Returns a list of matching items with their details.",
    schema: searchWardrobeSchema,
    func: async ({ query }: z.infer<typeof searchWardrobeSchema>) => {
  
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
  
        const results = Array.from(resultsMap.values());
        if (results.length === 0) {
          return "Nothing found in the user's wardrobe for this query.";
        }
        return results;
      } catch (err: unknown) {
        logger.error({ userId, query, err: (err as Error)?.message }, 'Failed to search wardrobe');
        if ((err as any).statusCode) {
          throw err;
        }
        throw createError.internalServerError('Failed to search wardrobe', { cause: err });
      }
    },
  });
}


/**
 * Dynamic tool for retrieving user's latest color analysis results.
 * Provides color palette information, undertone analysis, and color recommendations.
 */
export function fetchColorAnalysis(userId: string): Tool {
  const fetchColorAnalysisSchema = z.object({});

  return new Tool({
    name: 'fetchColorAnalysis',
    description: "Retrieves the user's most recent color analysis results. This includes their recommended color palette, skin undertone, and specific colors that flatter them or that they should avoid. Use this to give personalized style advice based on colors.",
    schema: fetchColorAnalysisSchema,
    func: async () => {

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
        if (!result) {
          return 'No color analysis found for the user.';
        }
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
}

/**
 * Dynamic tool for retrieving user memories using semantic similarity search.
 * Ranks memories by relevance to the query using vector embeddings and cosine similarity.
 */
export function fetchRelevantMemories(userId: string): Tool {
  const fetchRelevantMemoriesSchema = z.object({
    query: z.string().describe('A natural language query describing the information you want to find about the user. For example: "user\'s favorite color" or "upcoming vacation destination".'),
  });

  return new Tool({
    name: 'fetchRelevantMemories',
    description: "Searches the user's personal profile and past conversations for relevant information. Use this to recall user preferences, style, or any other personal details they have shared.",
    schema: fetchRelevantMemoriesSchema,
    func: async ({ query }: z.infer<typeof fetchRelevantMemoriesSchema>) => {

      if (!query) {
        throw createError.badRequest('Query is required');
      }

      try {
        const model = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });
        const embeddedQuery = await model.embedQuery(query);
        const vector = JSON.stringify(embeddedQuery);
        
        const memories: { id: string, memory: string }[] = await prisma.$queryRaw`
          SELECT id, memory FROM "Memory"
          WHERE "embedding" IS NOT NULL AND "userId" = ${userId}
          ORDER BY "embedding" <=> ${vector}::vector
          LIMIT 5
        `;

        if (memories.length === 0) {
          return "No relevant memories found for this query.";
        }
        return memories;
      } catch (err: unknown) {
        logger.error({ userId, query, err: (err as Error)?.message }, 'Failed to fetch relevant memories');
        if ((err as any).statusCode) {
          throw err;
        }
        throw createError.internalServerError('Failed to fetch relevant memories', { cause: err });
      }
    },
  });
}

