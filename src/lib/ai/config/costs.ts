/**
 * A centralized map of model costs per million tokens.
 */
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": {
    input: 0.25,
    output: 2.0,
  },
  "openai/gpt-oss-120b": {
    input: 0.15,
    output: 0.75,
  },
};
