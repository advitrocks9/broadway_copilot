import 'dotenv/config';
import path from 'path';
import { promises as fs } from 'fs';
import { buildAgentGraph } from '../src/agent/graph';

async function main() {
  const compiled = buildAgentGraph();
  const drawable = await compiled.getGraphAsync();
  const blob = await drawable.drawMermaidPng({ backgroundColor: 'white' });
  const arrayBuffer = await blob.arrayBuffer();
  const outPath = path.resolve(process.cwd(), 'langgraph.png');
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
  console.log(`Graph PNG written to: ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to render graph PNG:', err);
  process.exit(1);
});


