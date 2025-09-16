import { Prisma } from "@prisma/client";

export type BufferedNodeRun = Omit<Prisma.NodeRunCreateInput, "graphRun"> & {
  id: string;
};

export type BufferedLlmTrace = Omit<Prisma.LLMTraceCreateInput, "nodeRun"> & {
  nodeRunId: string;
  id: string;
};

export interface TraceBuffer {
  nodeRuns: BufferedNodeRun[];
  llmTraces: BufferedLlmTrace[];
}
