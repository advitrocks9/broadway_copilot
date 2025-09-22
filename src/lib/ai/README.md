# @ai Library

A lightweight, TypeScript-first toolkit for working with Large Language Models (LLMs) inside Broadway Copilot. The modules in this directory power our agent workflows, trace instrumentation, and tooling integrations for OpenAI and Groq models.

## Highlights
- **Type safe from end to end:** Models, tools, and structured output run through Zod validation.
- **Provider flexibility:** Unified abstractions for OpenAI (Chat Completions & Responses APIs) and Groq chat models.
- **First-class tool calling:** Bind Zod-described tools to any model and receive strongly typed arguments.
- **Structured output without boilerplate:** Force JSON returns via automatic tool injection or fallback parsing.
- **Trace aware:** Every run records node executions and LLM traces through a shared `TraceBuffer`.
- **Agent-ready primitives:** Compose multi-step loops with `agentExecutor`, cached model helpers, and cost tracking.
- **Multimodal & embeddings:** Send text+image content to OpenAI models and generate embeddings via `OpenAIEmbeddings`.

## Installation

All required dependencies are already part of this repository. For a fresh project, install the peer packages:

```bash
npm install openai groq-sdk zod zod-to-json-schema @prisma/client dotenv
```

> The library eagerly loads environment variables via `import 'dotenv/config'`, so ensure your `.env` is available when running locally.

## Environment Setup

Provide API keys for the providers you plan to use:

```bash
# Required for ChatOpenAI and OpenAIEmbeddings
export OPENAI_API_KEY="sk-..."

# Required for ChatGroq
export GROQ_API_KEY="gsk_..."
```

## Quick Start

### Basic chat completion (OpenAI)

```typescript
import { createId } from '@paralleldrive/cuid2';
import { ChatOpenAI, SystemMessage, UserMessage } from '.';
import type { TraceBuffer } from '../../agent/tracing';

function createTraceBuffer(nodeName: string): TraceBuffer {
  const now = new Date();
  return {
    nodeRuns: [
      {
        id: createId(),
        nodeName,
        startTime: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    llmTraces: [],
  };
}

const model = new ChatOpenAI({ model: 'gpt-4.1' });
const systemPrompt = new SystemMessage('You are a helpful assistant.');
const messages = [new UserMessage('What is the capital of France?')];
const traceBuffer = createTraceBuffer('basic-chat');

const result = await model.run(systemPrompt, messages, traceBuffer, 'basic-chat');
console.log(result.assistant.content[0].text);
```

### Structured output

```typescript
import { z } from 'zod';
import { ChatOpenAI, SystemMessage, UserMessage } from '.';
import type { TraceBuffer } from '../../agent/tracing';

const schema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const model = new ChatOpenAI();
const structured = model.withStructuredOutput(schema);
const traceBuffer: TraceBuffer = {
  nodeRuns: [
    {
      id: 'user-info-node',
      nodeName: 'extract-user-info',
      startTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  llmTraces: [],
};

const result = await structured.run(
  new SystemMessage('Extract structured details about the user.'),
  [
    new UserMessage(
      "Hi! I'm Jane Doe, 32 years old, and you can reach me at jane@example.com.",
    ),
  ],
  traceBuffer,
  'extract-user-info',
);

console.log(result.name); // "Jane Doe"
```

### Agent loop with tools

```typescript
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import {
  agentExecutor,
  ChatGroq,
  SystemMessage,
  Tool,
  UserMessage,
} from '.';
import type { TraceBuffer } from '../../agent/tracing';

const weatherTool = new Tool({
  name: 'get_weather',
  description: 'Fetch the current weather for a city',
  schema: z.object({ city: z.string() }),
  func: async ({ city }) => ({ city, temperatureC: 22, condition: 'sunny' }),
});

const systemPrompt = new SystemMessage('You are a concise weather assistant.');
const history = [new UserMessage('What is the weather in Paris right now?')];

const traceBuffer: TraceBuffer = {
  nodeRuns: [
    {
      id: createId(),
      nodeName: 'weather-agent',
      startTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  llmTraces: [],
};

const summary = await agentExecutor(
  new ChatGroq(),
  systemPrompt,
  history,
  {
    tools: [weatherTool],
    outputSchema: z.object({ weather: z.string() }),
    nodeName: 'weather-agent',
  },
  traceBuffer,
);

console.log(summary.weather);
```

## Core Concepts

### Trace instrumentation (`TraceBuffer`)

Every `run` call requires a `TraceBuffer` so we can link LLM activity back to the state graph and persist it later. A minimal buffer contains:

- A `nodeRuns` entry for the node currently executing the model. The entry must have a unique `id`, the `nodeName`, `startTime`, and timestamp metadata. Leave `endTime` unset until the graph finishes the node.
- An initially empty `llmTraces` array. The model will append structured traces with token usage, raw requests, and responses.

When executing inside `StateGraph`, the framework constructs these entries for you. For standalone usage (like the examples above) create them manually as shown.

### Messages

Conversation state is expressed through message classes in `core/messages`:

- `SystemMessage` &mdash; high-level instructions for the assistant.
- `UserMessage` &mdash; accepts plain text or multimodal content (text + `image_url`).
- `AssistantMessage` &mdash; responses from the model, including captured tool calls in `meta`.
- `ToolMessage` &mdash; serialized results returned to the model after a tool invocation.

The base class (`BaseMessage`) normalizes message content into arrays of typed parts for consistent downstream handling.

### Tools

`Tool` wraps an executable function with a name, description, and Zod schema. Tools are bound to models via `.bind([toolA, toolB])` and are surfaced to OpenAI/Groq using JSON schema generated by `zod-to-json-schema`. Arguments are validated before your function runs, and results are returned to the model as `ToolMessage` instances.

### Chat models

Both `ChatOpenAI` and `ChatGroq` extend `BaseChatCompletionsModel`, so they share the same interface:

```typescript
run(
  systemPrompt: SystemMessage,
  messages: BaseMessage[],
  traceBuffer: TraceBuffer,
  nodeName: string,
): Promise<RunOutcome>
```

Key differences:

- **ChatOpenAI**
  - Default model: `gpt-4.1`.
  - Supports both Chat Completions and Responses APIs (`useResponsesApi: true`).
  - Responses API exposes `reasoning` effort, multimodal inputs, and raw function calls via `meta.raw_tool_calls`.
  - `responseFormat` lets you enable JSON mode when using Chat Completions.
  - Structured output tool name defaults to `structured_output`.

- **ChatGroq**
  - Default model: `llama3-70b-8192`.
  - Filters out image parts (Groq currently accepts text-only inputs).
  - Accepts `maxRetries` and `timeout` options passed through to the SDK.
  - Structured output tool name is `json` to match Groq's expectations.

Both models calculate cost estimates based on `MODEL_COSTS` and append them to the emitted LLM traces.

### Structured output runnable

`model.withStructuredOutput(schema)` clones the model, injects a synthetic tool for JSON emission, and returns a `StructuredOutputRunnable`. When the provider returns tool calls, we pull arguments directly; otherwise we fall back to parsing ```json blocks in the assistant message.

Call signature:

```typescript
StructuredOutputRunnable<T>.run(
  systemPrompt: SystemMessage,
  messages: BaseMessage[],
  traceBuffer: TraceBuffer,
  nodeName: string,
): Promise<T['_output']>
```

### Agent executor

`agentExecutor` orchestrates tool-using loops. It binds the provided tools, repeatedly calls the model, executes requested tools, and finally converts the assistant response into the desired schema by chaining a structured-output pass.

Important details:
- `options.nodeName` is used to locate the active node entry inside the `TraceBuffer`.
- Tool calls are de-duplicated by ID to guard against replayed requests.
- Errors thrown by tool functions are surfaced back to the model as error `ToolMessage` payloads.
- The default `maxLoops` is 5; override it for longer horizons.

### Embeddings

`OpenAIEmbeddings` offers a minimal wrapper around the embeddings API:

```typescript
const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' });
const vector = await embeddings.embedQuery('Hello world');
const vectors = await embeddings.embedDocuments(['foo', 'bar']);
```

### Cost configuration

`config/costs.ts` contains per-million token pricing used to annotate traces. Update `MODEL_COSTS` whenever you add a new model or pricing changes.

### Cached model helpers

`config/llm.ts` exposes `getTextLLM()` and `getVisionLLM()`, which lazily instantiate `ChatGroq` and `ChatOpenAI` instances tuned for typical workflows (text conversations vs. multimodal tasks). Use them inside graph nodes to avoid recreating clients on every invocation.

## API Reference

### Re-exports (`index.ts`)

```typescript
export * from './agents/executor';
export * from './config/costs';
export * from './config/llm';
export * from './core/base_chat_completions_model';
export * from './core/base_chat_model';
export * from './core/messages';
export * from './core/runnables';
export * from './core/structured_output_runnable';
export * from './core/tools';
export * from './groq/chat_models';
export * from './openai/chat_models';
export * from './openai/embeddings';
```

### Type definitions

```typescript
interface RunOutcome {
  assistant: BaseMessage;
  toolCalls: ToolCall[];
  raw: unknown;
}

interface OpenAIChatModelParams extends ChatModelParams {
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
  useResponsesApi?: boolean;
  responseFormat?: { type: 'text' | 'json_object' };
}

interface GroqChatModelParams extends ChatModelParams {
  maxRetries?: number;
  timeout?: number;
}

class Tool<TSchema extends ZodObject<Record<string, ZodType>>> {
  constructor(config: {
    name: string;
    description: string;
    schema: TSchema;
    func: (args: z.infer<TSchema>) => unknown | Promise<unknown>;
  });
}

function agentExecutor<T extends ZodType>(
  runner: BaseChatModel,
  systemPrompt: SystemMessage,
  history: BaseMessage[],
  options: { tools: Tool[]; outputSchema: T; nodeName: string },
  traceBuffer: TraceBuffer,
  maxLoops?: number,
): Promise<T['_output']>;
```

## Contributing

When adding new providers or capabilities:
1. Extend `BaseChatModel` (or `BaseChatCompletionsModel`) with a concrete implementation.
2. Update `index.ts` exports and documentation examples.
3. Add or adjust entries in `MODEL_COSTS` if pricing changes.
4. Provide sample usage in this README so other contributors can pick up the new feature quickly.

## License

MIT License &mdash; see the repository root `LICENSE` file.
