import 'dotenv/config';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { queryColors, fetchRecentTurns, queryWardrobe } from '../agent/tools';

const server = new FastMCP({
  name: 'Broadway Copilot MCP',
  version: '1.0.0',
});

server.addTool({
  name: 'getLatestColorAnalysis',
  description: "Requires user_id as a parameter. .Get the user's latest color analysis. This includes details about the user's undertone, seasonal palette, skin tone, eye color, hair color, and top 3 colors for their profile and their 3 colors to avoid.",
  parameters: z.object({
    user_id: z.string(),
  }),
  execute: async (args) => {
    console.log('🔧 [MCP] getLatestColorAnalysis called', args);
    const result = await queryColors(args.user_id);
    return JSON.stringify(result);
  },
});

server.addTool({
  name: 'getRecentMessages',
  description: "Requires user_id as a parameter. The number of messages to return is optional and is set to 12 by default. This returns the transcript between the user and the assistant. Messages are returned in order Get the user's latest chat messages up to n messages. This includes the user's messages and the assistant's responses.",
  parameters: z.object({
    user_id: z.string(),
    n: z.number().int().positive().max(100).optional(),
  }),
  execute: async (args) => {
    console.log('🔧 [MCP] getRecentMessages called', args);
    const limit = args.n ?? 12;
    const messages = await fetchRecentTurns(args.user_id, limit);
    return JSON.stringify({ messages });
  },
});

server.addTool({
  name: 'getWardrobeItems',
  description: " Requires user_id as a parameter. Get the user's wardrobe items. This includes the user's clothing items and their details.",
  parameters: z.object({
    user_id: z.string(),
  }),
  execute: async (args) => {
    console.log('🔧 [MCP] getWardrobeItems called', args);
    const result = await queryWardrobe(args.user_id);
    return JSON.stringify(result);
  },
});

const port = Number(process.env.MCP_PORT || 3030);
const endpoint = '/mcp';

server.start({
  transportType: 'httpStream',
  httpStream: { port, endpoint, stateless: true }
});

console.log(`🚀 [MCP] Server started on port ${port} at ${endpoint}`);

