# Agent Tracing Suite Documentation

This document provides a comprehensive overview of the agent's tracing suite. The system is designed to capture detailed, hierarchical data for every user interaction, enabling in-depth analysis, debugging, and performance monitoring via the admin dashboard.

## High-Level Overview

The tracing system is built around a three-level hierarchy of Prisma models that capture the entire lifecycle of a request, from the initial user message to the final response.

The hierarchy is as follows:

1.  **`GraphRun`**: The top-level record representing the entire execution of the agent for a single incoming message.
2.  **`NodeRun`**: A record representing a single step or "node" within a `GraphRun`. Each `GraphRun` consists of one or more `NodeRun`s.
3.  **`LLMTrace`**: The most granular record, capturing a single API call to a Large Language Model (LLM) made during a `NodeRun`.

This structure creates a clear parent-child relationship: `GraphRun` → `NodeRun` → `LLMTrace`.

---

## Data Models and Schemas

Below is a detailed breakdown of each data model and the schema for its JSON fields.

### 1. `GraphRun`

Represents a single, complete execution of the agent's state graph.

-   **Purpose**: To track the entire workflow triggered by a user's message.
-   **Key Fields**:
    -   `id`: `String` - The Twilio Message SID, linking the run to the specific incoming message.
    -   `userId`: `String` - Foreign key linking to the `User`.
    -   `conversationId`: `String` - Foreign key linking to the `Conversation`.
    -   `status`: `GraphRunStatus` - The final status of the run (`RUNNING`, `COMPLETED`, `ERROR`, `ABORTED`).
    -   `startTime`: `DateTime` - When the graph execution began.
    -   `endTime`: `DateTime?` - When the graph execution finished.
    -   `durationMs`: `Int?` - The total time taken for the entire run.
    -   `errorTrace`: `String?` - If the run failed, this contains the error stack trace.
-   **JSON Fields**:
    -   `initialState`: The state of the application when the graph run was initiated.
    -   `finalState`: The complete, final state of the graph when it concluded.

#### `initialState` JSON Schema

```json
{
  "input": {
    "MessageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "SmsSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "AccountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "MessagingServiceSid": "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "From": "whatsapp:+14155238886",
    "To": "whatsapp:+1234567890",
    "Body": "Hello there!",
    "NumMedia": "0",
    "ProfileName": "John Doe",
    "WaId": "1234567890"
  },
  "user": {
    "id": "clxxxxxxxxxxxxxxxxxxxx",
    "whatsappId": "1234567890",
    "profileName": "John Doe",
    // ... other user model fields
  }
}
```

#### `finalState` JSON Schema

The schema for `finalState` is dynamic and reflects the `GraphState` interface. It contains all the data accumulated throughout the graph's execution.

```json
{
  "graphRunId": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "conversationId": "clxxxxxxxxxxxxxxxxxxxx",
  "input": {
    "MessageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "SmsSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "SmsMessageSid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "AccountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "MessagingServiceSid": "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "From": "whatsapp:+14155238886",
    "To": "whatsapp:+1234567890",
    "Body": "Hello there!",
    "NumMedia": "0",
    "NumSegments": "1",
    "SmsStatus": "received",
    "ApiVersion": "2010-04-01",
    "ProfileName": "John Doe",
    "WaId": "1234567890"
  },
  "user": {
    "id": "clxxxxxxxxxxxxxxxxxxxx",
    "whatsappId": "1234567890",
    "profileName": "John Doe",
    "inferredGender": null,
    "inferredAgeGroup": null,
    "confirmedGender": "MALE",
    "confirmedAgeGroup": "AGE_26_35",
    "lastVibeCheckAt": "2023-10-27T10:00:00.000Z",
    "lastColorAnalysisAt": null,
    "createdAt": "2023-10-01T10:00:00.000Z"
  },
  "conversationHistoryWithImages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Hello!"
        }
      ]
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "Hi! How can I help you today?"
        }
      ]
    }
  ],
  "conversationHistoryTextOnly": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Hello!"
        }
      ]
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "text",
          "text": "Hi! How can I help you today?"
        }
      ]
    }
  ],
  "intent": "general",
  "stylingIntent": null,
  "generalIntent": "greeting",
  "missingProfileField": null,
  "availableServices": [
    "vibe_check",
    "occasion",
    "vacation",
    "color_analysis",
    "suggest"
  ],
  "assistantReply": [
    {
      "reply_type": "text",
      "reply_text": "Hello John! How can I help you with your style today?"
    }
  ],
  "pending": "NONE"
}
```

---

### 2. `NodeRun`

Represents the execution of a single node within the state graph.

-   **Purpose**: To isolate and measure the performance and outcome of each logical step in the agent's workflow.
-   **Key Fields**:
    -   `id`: `String` - Unique identifier for the node run.
    -   `graphRunId`: `String` - Foreign key linking to the parent `GraphRun`.
    -   `nodeName`: `String` - The name of the node that was executed (e.g., `ingestMessage`, `routeIntent`).
    -   `startTime`: `DateTime` - When the node's execution began.
    -   `endTime`: `DateTime?` - When the node's execution finished. A `null` value indicates a failure within this node.
    -   `durationMs`: `Int?` - The total time taken for the node to execute.

---

### 3. `LLMTrace`

Represents a single API call to an LLM provider (e.g., OpenAI, Groq).

-   **Purpose**: To provide deep visibility into the model's inputs, outputs, performance, and cost for every LLM interaction.
-   **Key Fields**:
    -   `id`: `String` - Unique identifier for the LLM trace.
    -   `nodeRunId`: `String` - Foreign key linking to the parent `NodeRun`.
    -   `model`: `String` - The specific model used (e.g., `gpt-5-mini`, `llama-3.3-70b-versatile`).
    -   `promptTokens`: `Int?` - Number of tokens in the input prompt.
    -   `completionTokens`: `Int?` - Number of tokens in the model's response.
    -   `totalTokens`: `Int?` - Total tokens used in the API call.
    -   `costUsd`: `Decimal?` - The calculated cost of the API call.
    -   `startTime`: `DateTime` - When the API call was initiated.
    -   `endTime`: `DateTime?` - When the API response was received.
    -   `durationMs`: `Int?` - The total duration of the API call.
    -   `errorTrace`: `String?` - If the API call failed, this contains the error details.

-   **JSON Fields**:
    -   `inputMessages`: The full conversation context sent to the model.
    -   `outputMessage`: The structured assistant message received from the model.
    -   `rawRequest`: The exact JSON payload sent to the provider's API.
    -   `rawResponse`: The complete, raw JSON response received from the provider.

#### `inputMessages` JSON Schema

This is an array of message objects, providing the full context for the LLM.

```json
[
  {
    "role": "system",
    "content": [{ "type": "text", "text": "You are a helpful assistant." }]
  },
  {
    "role": "user",
    "content": [{ "type": "text", "text": "What is the weather in New York?" }]
  }
]
```

#### `outputMessage` JSON Schema

This captures the assistant's reply, including any tool calls it may have made.

```json
{
  "role": "assistant",
  "content": [{ "type": "text", "text": "I can check that for you." }],
  "meta": {
    "tool_calls": [
      {
        "id": "call_abc123",
        "name": "get_weather",
        "arguments": { "location": "New York" }
      }
    ]
    // ... other metadata
  }
}
```

#### `rawRequest` JSON Schema

This is the exact payload sent to the LLM provider's API. The schema may vary slightly between providers (OpenAI vs. Groq) but generally follows this structure.

```json
{
  "model": "gpt-5-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the weather in New York?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather for a location",
        "parameters": { /* JSON Schema for tool arguments */ }
      }
    }
  ],
  "tool_choice": "auto",
  "temperature": 0.7
  // ... other API parameters
}
```

#### `rawResponse` JSON Schema

This is the full, unmodified response from the provider's API.

```json
{
  "id": "chatcmpl-xxxxxxxxxxxxxxxxxxxxxxxx",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-5-mini-0125",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\":\"New York\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 82,
    "completion_tokens": 18,
    "total_tokens": 100
  }
}
```

---

## Data Flow Lifecycle

1.  **Request Initiation (`src/agent/index.ts`)**: When a message arrives, the `runAgent` function creates a `GraphRun` record, storing the `initialState`.
2.  **Node Execution (`src/lib/graph.ts`)**: As the `StateGraph`'s `invoke` method iterates through nodes, it creates a `NodeRun` record before each node runs and updates it with `endTime` and `durationMs` after completion.
3.  **LLM Call (`src/lib/ai/core/base_chat_model.ts`)**:
    -   Inside a node, whenever an LLM is called, the `traceLLMCall` function is invoked.
    -   It finds the currently active `NodeRun` for the run.
    -   It creates an `LLMTrace` record, linking it to the `NodeRun` and storing the `inputMessages` and `rawRequest`.
    -   Upon receiving a response from the LLM API, it updates the `LLMTrace` record with the `outputMessage`, `rawResponse`, token usage, cost, and duration.
4.  **Request Finalization (`src/agent/index.ts`)**: Once the graph finishes, the `handleGraphRun` function updates the original `GraphRun` record with the `finalState`, final `status`, and total `durationMs`.
