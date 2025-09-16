import { createId } from "@paralleldrive/cuid2";

/**
 * @file A custom, lightweight implementation of a state graph inspired by LangGraph.
 * It supports nodes, edges, and conditional edges to build and run stateful, cyclical graphs.
 */

export const START = "START" as const;
export const END = "END" as const;

/**
 * Represents a function that can be executed as a node in the graph.
 * It receives the current state and returns a partial state to be merged.
 */
type NodeFunction<TState> = (
  state: TState,
) => Promise<Partial<TState>> | Partial<TState>;

/**
 * A function that resolves a string key to determine the next node in a conditional edge.
 */
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

/**
 * A class for building and running stateful graphs.
 * The graph is defined by a set of nodes and edges, and it processes data
 * by moving through the nodes, updating a state object at each step.
 */
export class StateGraph<TState extends object> {
  private readonly nodes = new Map<string, NodeFunction<TState>>();
  private readonly edges = new Map<
    string,
    DirectEdge | ConditionalEdge<TState>
  >();
  private startNode = "";

  /**
   * Adds a node to the graph.
   * @param name - The unique identifier for the node.
   * @param node - The function to execute for this node.
   * @returns The `StateGraph` instance for chaining.
   */
  addNode(name: string, node: NodeFunction<TState>): this {
    if (this.nodes.has(name)) {
      throw new Error(`Node "${name}" is already defined.`);
    }
    this.nodes.set(name, node);
    return this;
  }

  /**
   * Adds a direct edge between two nodes.
   * @param source - The name of the source node. Use `START` to define the entry point.
   * @param target - The name of the target node.
   * @returns The `StateGraph` instance for chaining.
   */
  addEdge(source: string, target: string): this {
    if (source === START) {
      if (this.startNode) {
        throw new Error("Start node is already defined.");
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

  /**
   * Adds a conditional edge from a source node to multiple possible target nodes.
   * The path taken is determined by the output of a resolver function.
   * @param source - The name of the source node.
   * @param resolver - A function that returns a key to select the target node.
   * @param targets - A map where keys are resolver outputs and values are target node names.
   * @returns The `StateGraph` instance for chaining.
   */
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

  /**
   * Compiles the graph into an executable object.
   * @returns An object with an `invoke` method to run the graph.
   */
  compile() {
    if (!this.startNode) {
      throw new Error(
        "Graph must have a starting point defined with `addEdge(START, ...)`.",
      );
    }

    return {
      /**
       * Executes the graph with a given initial state.
       * @param initialState - The initial state to begin execution with.
       * @param config - Optional configuration, including an AbortSignal.
       * @returns A promise that resolves with the final state of the graph.
       */
      invoke: async (
        initialState: TState,
        config?: { signal?: AbortSignal; runId?: string },
      ): Promise<TState> => {
        let currentNodeName: string | null = this.startNode;
        let currentState = { ...initialState };
        const graphRunId = config?.runId;

        while (currentNodeName && currentNodeName !== END) {
          if (config?.signal?.aborted) {
            const error = new Error("Graph execution aborted");
            error.name = "AbortError";
            throw error;
          }

          const currentNode = this.nodes.get(currentNodeName);
          if (!currentNode) {
            throw new Error(`Node "${currentNodeName}" not found.`);
          }

          const startTime = new Date();
          const nodeRunId = createId();

          if (graphRunId) {
            (currentState as any).traceBuffer.nodeRuns.push({
              id: nodeRunId,
              nodeName: currentNodeName,
              startTime,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }

          let stateUpdate;
          try {
            stateUpdate = await currentNode(currentState);
          } catch (e) {
            // Rethrow the error to be handled by the global graph run handler.
            // The node execution will be left in a pending state (no endTime), which is expected.
            throw e;
          }

          if (graphRunId) {
            const nodeRun = (currentState as any).traceBuffer.nodeRuns.find(
              (ne: any) => ne.id === nodeRunId,
            );
            if (nodeRun) {
              const endTime = new Date();
              nodeRun.endTime = endTime;
              nodeRun.durationMs =
                endTime.getTime() - nodeRun.startTime.getTime();
              nodeRun.updatedAt = endTime;
            }
          }
          currentState = { ...currentState, ...stateUpdate };

          const edge = this.edges.get(currentNodeName);
          if (!edge) {
            throw new Error(
              `No edge found from node "${currentNodeName}". All nodes must have an outgoing edge.`,
            );
          }

          if ("target" in edge) {
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
