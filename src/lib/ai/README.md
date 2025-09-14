# @ai Library

A lightweight, modern, and type-safe library for interacting with Large Language Models (LLMs). This library is designed to be simple, powerful, and easy to extend, focusing on core features like tool usage, structured output, and agentic workflows.

## Features

-   **Type-Safe:** Built with TypeScript and Zod for robust type safety and validation.
-   **Model Agnostic:** Easily switch between different LLM providers. Currently supports OpenAI and Groq.
-   **Structured Outputs:** Reliably get structured JSON output from any model, validated against a Zod schema.
-   **Tool Use:** Seamlessly integrate external tools that the LLM can call to perform actions.
-   **Agent Executor:** A simple yet powerful executor to create autonomous agents that can reason and use tools to accomplish tasks.
-   **Multi-Modal Support:** Handle both text and image inputs in conversations.
-   **Error Handling:** Comprehensive error handling with detailed error messages and validation.
-   **Modern API:** A clean, Promise-based API that is easy to learn and use.

## Installation

```bash
npm install zod openai
```

## Environment Setup

Set up your API keys as environment variables:

```bash
# For OpenAI
export OPENAI_API_KEY="your-openai-api-key"

# For Groq
export GROQ_API_KEY="your-groq-api-key"
```

## Core Concepts

The library is built around a few core concepts that work together to provide a powerful and flexible experience.

### 1. Models

The `BaseChatModel` class is the foundation for all model interactions. Concrete implementations like `ChatOpenAI` and `ChatGroq` handle the communication with specific LLM providers.

**Initialization:**

```typescript
import { ChatOpenAI, ChatGroq, SystemMessage } from '@ai';

// Initialize OpenAI model (uses OPENAI_API_KEY from environment)
const openAIModel = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 1024,
});

// Initialize Groq model (uses GROQ_API_KEY from environment)
const groqModel = new ChatGroq({
  model: 'openai/gpt-oss-120b',
  temperature: 0.7,
});
```

### 2. Messages

Conversations are represented as an array of `BaseMessage` objects. There are four types of messages:

-   `SystemMessage`: Sets the context or instructions for the AI.
-   `UserMessage`: Represents a message from the user (supports text and images).
-   `AssistantMessage`: Represents a response from the AI.
-   `ToolMessage`: Represents the result of a tool execution.

```typescript
import { SystemMessage, UserMessage, AssistantMessage, ToolMessage } from '@ai';

// Basic text messages
const messages = [
  new SystemMessage('You are a helpful assistant.'),
  new UserMessage('What is the capital of France?'),
  new AssistantMessage('The capital of France is Paris.'),
  new UserMessage('What is its population?'),
];

// Multi-modal message with image
const multiModalMessage = new UserMessage([
  { type: 'text', text: 'What do you see in this image?' },
  { 
    type: 'image_url', 
    image_url: { 
      url: 'data:image/jpeg;base64,...',
      detail: 'high' // 'low', 'high', or 'auto'
    } 
  },
]);

// Tool message
const toolMessage = new ToolMessage(
  '{"temperature": 72, "condition": "sunny"}',
  'call_123',
  'get_weather'
);
```

### 3. Tools

Tools are functions that the model can decide to call to get more information or perform actions. They are defined with a name, description, a Zod schema for the arguments, and the function to execute.

**Defining a Tool:**

```typescript
import { z } from 'zod';
import { Tool } from '@ai';

const weatherTool = new Tool({
  name: 'get_weather',
  description: 'Get the current weather for a specific location',
  schema: z.object({
    location: z.string().describe('The city to get the weather for'),
    unit: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature unit'),
  }),
  func: async ({ location, unit = 'celsius' }) => {
    // In a real app, you would call a weather API here
    const temperature = unit === 'celsius' ? 22 : 72;
    return { 
      temperature, 
      condition: 'sunny',
      location,
      unit 
    };
  },
});
```

To make a model aware of a tool, you use the `.bind()` method.

```typescript
const modelWithTools = openAIModel.bind([weatherTool]);
```

### 4. Structured Output

You can force the model to return a JSON object that conforms to a specific Zod schema. This is incredibly useful for extracting structured data from unstructured text.

You use the `.withStructuredOutput()` method, which returns a `StructuredOutputRunnable`.

```typescript
import { z } from 'zod';

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
  preferences: z.object({
    theme: z.enum(['light', 'dark']),
    notifications: z.boolean(),
  }).optional(),
});

const structuredModel = openAIModel.withStructuredOutput(userSchema);
```

When you run this model, the result is a typed object, not a message.

### 5. Agent Executor

The `agentExecutor` orchestrates the interaction between the LLM, tools, and the user. It creates an agentic loop where the model can use tools over multiple steps to solve a problem.

```typescript
import { agentExecutor, UserMessage, SystemMessage } from '@ai';

const conversation = await agentExecutor(
  openAIModel,
  new SystemMessage('You are a helpful weather assistant.'),
  [new UserMessage('What is the weather in New York?')],
  {
    tools: [weatherTool],
    outputSchema: z.object({ weather: z.string() }),
  },
  'some-graph-run-id',
);
```

The executor handles the back-and-forth communication, calling tools when needed and feeding the results back to the model until it can generate a final answer.

---

## Usage & Examples

### Example 1: Basic Chat Completion

This is the simplest use case: getting a response from the model.

```typescript
import { ChatOpenAI, UserMessage, SystemMessage } from '@ai';

async function main() {
  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
  const messages = [new UserMessage('What is the capital of France?')];
  const systemPrompt = new SystemMessage('You are a helpful assistant.');

  const result = await model.run(systemPrompt, messages, 'some-graph-run-id');

  console.log(result.assistant.content[0].text);
  // Output: The capital of France is Paris.
}

main();
```

### Example 2: Multi-Modal Conversation

Handle both text and image inputs.

```typescript
import { ChatOpenAI, UserMessage, SystemMessage } from '@ai';

async function analyzeImage() {
  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });

  const message = new UserMessage([
    { type: 'text', text: 'What do you see in this image?' },
    {
      type: 'image_url',
      image_url: {
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...',
        detail: 'high',
      },
    },
  ]);

  const result = await model.run(
    new SystemMessage('You are an image analysis expert.'),
    [message],
    'some-graph-run-id',
  );

  console.log(result.assistant.content[0].text);
}

analyzeImage();
```

### Example 3: Getting Structured Output

Extract structured data from a user's message with type coercion and validation.

```typescript
import { ChatOpenAI, UserMessage, SystemMessage } from '@ai';
import { z } from 'zod';

async function extractUserInfo() {
  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });

  const extractionSchema = z.object({
    name: z.string().describe('The full name of the user'),
    age: z.number().describe('The age of the user'),
    email: z.string().email().describe('The email address'),
    interests: z.array(z.string()).describe('List of interests'),
    isStudent: z.boolean().describe('Whether the user is a student'),
  });

  const structuredModel = model.withStructuredOutput(extractionSchema);

  const result = await structuredModel.run(
    new SystemMessage(
      'Extract structured information from the user message.',
    ),
    [
      new UserMessage(
        'Hi, I\'m John Doe, 30 years old. My email is john@example.com. I love coding and hiking. I work as a software engineer.',
      ),
    ],
    'some-graph-run-id',
  );

  console.log(result);
  // Output: {
  //   name: 'John Doe',
  //   age: 30,
  //   email: 'john@example.com',
  //   interests: ['coding', 'hiking'],
  //   isStudent: false
  // }
}

extractUserInfo();
```

### Example 4: Building an Agent with Multiple Tools

Create a sophisticated agent that can use multiple tools to answer complex questions.

```typescript
import {
  ChatOpenAI,
  UserMessage,
  SystemMessage,
  agentExecutor,
  Tool,
} from '@ai';
import { z } from 'zod';

async function createWeatherAgent() {
  // Define multiple tools
  const weatherTool = new Tool({
    name: 'get_weather',
    description: 'Get the current weather for a location',
    schema: z.object({ 
      location: z.string().describe('The city to get weather for'),
      unit: z.enum(['celsius', 'fahrenheit']).optional()
    }),
    func: async ({ location, unit = 'celsius' }) => {
      // Simulate API call
      const temp = unit === 'celsius' ? 22 : 72;
      return {
        location,
        temperature: temp,
        condition: 'sunny',
        humidity: 65,
        unit
      };
    },
  });

  const locationTool = new Tool({
    name: 'get_location_info',
    description: 'Get additional information about a location',
    schema: z.object({
      location: z.string().describe('The city to get information about')
    }),
    func: async ({ location }) => {
      return {
        location,
        country: 'United States',
        timezone: 'EST',
        population: '8.4 million'
      };
    },
  });

  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
  const history = [
    new UserMessage('What\'s the weather like in New York and tell me about the city?'),
  ];

  const finalConversation = await agentExecutor(
    model,
    new SystemMessage(
      'You are a helpful weather and travel assistant. Use tools to get accurate information.',
    ),
    history,
    { tools: [weatherTool, locationTool] },
    'some-graph-run-id',
  );

  const finalMessage = finalConversation[finalConversation.length - 1];
  console.log(finalMessage.content[0].text);
  // Output: Comprehensive response about NYC weather and city information
}

createWeatherAgent();
```

### Example 5: Error Handling and Tool Failures

Handle tool execution errors gracefully.

```typescript
import { ChatOpenAI, UserMessage, SystemMessage, agentExecutor, Tool } from '@ai';
import { z } from 'zod';

async function handleToolErrors() {
  const unreliableTool = new Tool({
    name: 'unreliable_api',
    description: 'A tool that sometimes fails',
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => {
      // Simulate random failures
      if (Math.random() < 0.5) {
        throw new Error('API temporarily unavailable');
      }
      return { result: `Data for: ${query}` };
    },
  });

  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
  const history = [new UserMessage('Get some data using the unreliable tool.')];

  try {
    const conversation = await agentExecutor(
      model,
      new SystemMessage('You are a helpful assistant. If a tool fails, explain the error to the user.'),
      history,
      { tools: [unreliableTool] },
      'some-graph-run-id',
    );

    const finalMessage = conversation[conversation.length - 1];
    console.log(finalMessage.content[0].text);
  } catch (error) {
    console.error('Agent execution failed:', error);
  }
}

handleToolErrors();
```

### Example 6: Custom Model Configuration

Configure models with various parameters for different use cases.

```typescript
import { ChatOpenAI, ChatGroq, UserMessage, SystemMessage } from '@ai';

async function modelConfiguration() {
  // High creativity model for creative writing
  const creativeModel = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0.9,
    topP: 0.95,
    maxTokens: 2000,
  });

  // Deterministic model for data extraction
  const deterministicModel = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    seed: 42, // For reproducible outputs
    maxTokens: 500,
  });

  // Fast model for simple tasks
  const fastModel = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    temperature: 0.3,
    maxTokens: 100,
  });

  const creativeResult = await creativeModel.run(
    new SystemMessage('You are a creative writer.'),
    [new UserMessage('Write a short story about a robot learning to paint.')],
    'some-graph-run-id',
  );

  const extractionResult = await deterministicModel.run(
    new SystemMessage('Extract only the facts from the following text.'),
    [
      new UserMessage(
        'The meeting is scheduled for March 15th at 2:00 PM in room 101.',
      ),
    ],
    'some-graph-run-id',
  );

  console.log('Creative:', creativeResult.assistant.content[0].text);
  console.log('Extraction:', extractionResult.assistant.content[0].text);
}

modelConfiguration();
```

### Example 7: Advanced Structured Output with Complex Schemas

Handle complex nested data structures with validation and coercion.

```typescript
import { ChatOpenAI, UserMessage, SystemMessage } from '@ai';
import { z } from 'zod';

async function complexStructuredOutput() {
  const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
  
  const complexSchema = z.object({
    person: z.object({
      name: z.string(),
      age: z.number(),
      contact: z.object({
        email: z.string().email(),
        phone: z.string().optional(),
      }),
    }),
    preferences: z.object({
      theme: z.enum(['light', 'dark']),
      notifications: z.boolean(),
      language: z.string().default('en'),
    }),
    tags: z.array(z.string()),
    metadata: z.object({
      createdAt: z.string().datetime().optional(),
      source: z.string(),
    }),
  });

  const structuredModel = model.withStructuredOutput(complexSchema);

  const result = await structuredModel.run(
    new SystemMessage(
      'Extract all information about the person and their preferences.',
    ),
    [
      new UserMessage(`
      John Smith is 30 years old. His email is john@example.com and phone is 555-1234.
      He prefers dark theme, wants notifications enabled, and speaks English.
      He's interested in technology, programming, and hiking.
      This information was collected from our website contact form.
    `),
    ],
    'some-graph-run-id',
  );

  console.log(JSON.stringify(result, null, 2));
  // Output: Properly structured and validated object
}

complexStructuredOutput();
```

## API Reference

### ChatOpenAI

```typescript
import { OpenAIChatModelParams } from '@ai';

class ChatOpenAI extends BaseChatCompletionsModel {
  constructor(
    params?: Partial<OpenAIChatModelParams>,
    client?: OpenAI
  );
}
```

**Default Model:** `gpt-4.1`

### ChatGroq

```typescript
import { GroqChatModelParams } from '@ai';

class ChatGroq extends BaseChatCompletionsModel {
  constructor(
    params?: Partial<GroqChatModelParams>,
    client?: Groq
  );
}
```

**Default Model:** `llama3-70b-8192`

### Tool

```typescript
class Tool<T extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  schema: ZodObject<T>;
  func: (args: z.infer<ZodObject<T>>) => unknown | Promise<unknown>;

  constructor(config: {
    name: string;
    description: string;
    schema: ZodObject<T>;
    func: (args: z.infer<ZodObject<T>>) => unknown | Promise<unknown>;
  });
}
```

### agentExecutor

```typescript
function agentExecutor(
  runner: BaseChatModel,
  systemPrompt: SystemMessage,
  history: BaseMessage[],
  options: {
    tools: Tool<any>[];
    outputSchema: T;
    nodeName?: string;
  },
  graphRunId: string,
  maxLoops?: number,
): Promise<T['_output']>;
```

**Parameters:**
- `runner`: The chat model instance to use
- `systemPrompt`: A guiding prompt for the agent's persona
- `history`: Initial conversation history
- `options.tools`: Array of available tools
- `options.outputSchema`: Zod schema for the final, structured output
- `graphRunId`: The ID of the current graph run for tracing
- `maxLoops`: Maximum iterations (default: 5)

## Error Handling

The library provides comprehensive error handling:

- **API Errors**: Network and authentication errors from LLM providers
- **Validation Errors**: Schema validation failures for tools and structured output
- **Tool Execution Errors**: Errors during tool function execution
- **Agent Loop Errors**: Maximum iteration exceeded or infinite loops

All errors include detailed messages and context for debugging.

## Contributing

This library is designed to be extensible. To add support for new LLM providers:

1. Extend `BaseChatModel`
2. Implement the required abstract methods
3. Add your provider to the exports

## License

MIT License - see LICENSE file for details.