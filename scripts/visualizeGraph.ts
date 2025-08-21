import 'dotenv/config';
import path from 'path';
import { promises as fs } from 'fs';
import { buildAgentGraph } from '../src/agent/graph';
import { getLogger } from '../src/utils/logger';

/**
 * Renders the agent graph to a PNG file for visualization.
 */
const logger = getLogger('script:visualizeGraph');

async function main() {
  const compiled = buildAgentGraph();
  const drawable = await compiled.getGraphAsync();
  const blob = await drawable.drawMermaidPng({ backgroundColor: 'white' });
  const arrayBuffer = await blob.arrayBuffer();
  const outPath = path.resolve(process.cwd(), 'langgraph.png');
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
  logger.info({ outPath }, 'Graph PNG written');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to render graph PNG');
  process.exit(1);
});


