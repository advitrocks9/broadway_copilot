import { createId } from '@paralleldrive/cuid2';
import type { BufferedNodeRun, TraceBuffer } from '../agent/tracing';

export const START = 'START' as const;
export const END = 'END' as const;

type NodeFunction<TState> = (state: TState) => Promise<Partial<TState>> | Partial<TState>;

type ConditionalEdgeResolver<TState> = (state: TState) => string;

interface Edge {
  source: string;
}

interface DirectEdge extends Edge {
  target: string;
}

interface ConditionalEdge<TState> extends Edge {
  resolver: ConditionalEdgeResolver<TState>;
  targets: Record<string, string>;
}

export class StateGraph<TState extends object> {
  private readonly nodes = new Map<string, NodeFunction<TState>>();
  private readonly edges = new Map<string, DirectEdge | ConditionalEdge<TState>>();
  private startNode = '';

  addNode(name: string, node: NodeFunction<TState>): this {
    if (this.nodes.has(name)) {
      throw new Error(`Node "${name}" is already defined.`);
    }
    this.nodes.set(name, node);
    return this;
  }

  addEdge(source: string, target: string): this {
    if (source === START) {
      if (this.startNode) {
        throw new Error('Start node is already defined.');
      }
      this.startNode = target;
      return this;
    }

    if (this.edges.has(source)) {
      throw new Error(`An edge from "${source}" is already defined.`);
    }
    this.edges.set(source, { source, target });
    return this;
  }

  addConditionalEdges(
    source: string,
    resolver: ConditionalEdgeResolver<TState>,
    targets: Record<string, string>,
  ): this {
    if (this.edges.has(source)) {
      throw new Error(`An edge from "${source}" is already defined.`);
    }
    this.edges.set(source, { source, resolver, targets });
    return this;
  }

  compile() {
    if (!this.startNode) {
      throw new Error('Graph must have a starting point defined with `addEdge(START, ...)`.');
    }

    return {
      invoke: async (
        initialState: TState,
        config: { signal?: AbortSignal; runId?: string } = {},
      ): Promise<TState> => {
        let currentNodeName = this.startNode;
        let currentState = { ...initialState };
        const { signal, runId: graphRunId } = config;

        while (currentNodeName !== END) {
          if (signal?.aborted) {
            const error = new Error('Graph execution aborted');
            error.name = 'AbortError';
            throw error;
          }

          const currentNode = this.nodes.get(currentNodeName);
          if (!currentNode) {
            throw new Error(`Node "${currentNodeName}" not found.`);
          }

          const startTime = new Date();
          const nodeRunId = createId();

          const traceCandidate = (currentState as { traceBuffer?: TraceBuffer }).traceBuffer;
          const traceBuffer: TraceBuffer | null =
            graphRunId && traceCandidate ? traceCandidate : null;
          let nodeRunEntry: BufferedNodeRun | null = null;
          if (traceBuffer) {
            nodeRunEntry = {
              id: nodeRunId,
              nodeName: currentNodeName,
              startTime,
              createdAt: startTime,
              updatedAt: startTime,
            };
            traceBuffer.nodeRuns.push(nodeRunEntry);
          }

          let stateUpdate: Partial<TState> | undefined;
          try {
            stateUpdate = await currentNode(currentState);
          } catch (e) {
            // Node execution left without endTime -- expected, handled by global graph run handler
            throw e;
          }

          if (nodeRunEntry) {
            const endTime = new Date();
            nodeRunEntry.endTime = endTime;
            nodeRunEntry.durationMs = endTime.getTime() - startTime.getTime();
            nodeRunEntry.updatedAt = endTime;
          }
          if (stateUpdate !== undefined) {
            currentState = { ...currentState, ...stateUpdate };
          }

          const edge = this.edges.get(currentNodeName);
          if (!edge) {
            throw new Error(
              `No edge found from node "${currentNodeName}". All nodes must have an outgoing edge.`,
            );
          }

          if ('target' in edge) {
            currentNodeName = edge.target;
          } else {
            const targetKey = edge.resolver(currentState);
            const nextNode = edge.targets[targetKey];
            if (!nextNode) {
              throw new Error(
                `Conditional edge from "${currentNodeName}" resolved to "${targetKey}", which is not a valid target.`,
              );
            }
            currentNodeName = nextNode;
          }
        }
        return currentState;
      },
    };
  }
}
