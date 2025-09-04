import prisma from '../lib/prisma';
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

