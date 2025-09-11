# Broadway Copilot

Broadway Copilot is a sophisticated, AI-powered personal stylist delivered through an intuitive WhatsApp interface. It leverages large language models and computer vision to provide personalized fashion advice, analyze outfits, and help users manage their wardrobe.

The application is built with a robust, scalable architecture using Node.js, Express, and a state-of-the-art agent framework powered by LangGraph. It's designed for production deployment with Docker and Google Cloud Run.

![Agent Graph](./langgraph.png)

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
- [Usage](#usage)
  - [Running Locally](#running-locally)
  - [Available Scripts](#available-scripts)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Key Components](#key-components)
- [Deployment](#deployment)
  - [Docker](#docker)
  - [Google Cloud Run](#google-cloud-run)
- [Troubleshooting](#troubleshooting)

## Features

Broadway Copilot offers a range of intelligent features to serve as a user's virtual fashion assistant:

**Fashion & Style Analysis:**
-   **Outfit Rating (Vibe Check)**: Upload outfit photos for AI-powered analysis with detailed scores for fit, color harmony, styling details, accessories, and overall aesthetic.
-   **Color Analysis**: Get seasonal color analysis from face photos or color palettes, providing personalized color recommendations, undertone identification, and makeup/hair suggestions.
-   **Style Suggestions**: Receive outfit improvement recommendations, style tweaks, and shopping suggestions based on your current looks.

**Personalized Recommendations:**
-   **Occasion Styling**: Get event-appropriate outfit advice considering dress code, weather, climate, and occasion tone.
-   **Vacation Packing**: Receive destination-aware outfit and packing recommendations with weather/activity context and capsule wardrobe suggestions.
-   **Item Pairing**: Learn how to style specific clothing items with complementary color, silhouette, fabric, and accessory recommendations.

**Smart Conversation Flow:**
-   **Intent Recognition**: Automatically understands user requests and routes to appropriate specialized handlers.
-   **Context Awareness**: Maintains conversation context across multiple turns for a natural, human-like interaction.
-   **Profile Inference**: Learns user preferences including gender, style preferences, and fashion profile over time.
-   **Multi-modal Input**: Processes both text messages and image uploads seamlessly.

## Architecture

The application is built on a modern, scalable backend architecture designed for real-time, stateful conversations over WhatsApp.

### High-Level Flow

1.  **Message Ingestion**: A user sends a WhatsApp message, which triggers a webhook from Twilio to the application's `/twilio/` endpoint.
2.  **Authentication & Rate Limiting**: The Express server authenticates the incoming request to ensure it's from Twilio and applies rate limiting to prevent abuse.
3.  **Queuing & Concurrency**: The message is placed into a Redis-based queue. A concurrency controller ensures that only one message per user is processed at a time, preventing race conditions and ensuring conversational context is maintained. New messages from a user will abort any ongoing processing for that same user.
4.  **Agent Execution**: The message is picked up by a processor that invokes the LangGraph agent.
5.  **Stateful Processing**: The agent executes a series of nodes based on the conversation's current state, the user's input, and the inferred intent. It may fetch conversation history from the PostgreSQL database, call the OpenAI API for analysis, or access other services.
6.  **Response Generation**: Once the agent determines the appropriate response, it calls the `send_reply` node.
7.  **Message Delivery**: The `send_reply` node uses the Twilio service to send the response back to the user via WhatsApp.
8.  **Status Callbacks**: Twilio sends delivery status updates to the `/twilio/callback/` endpoint, allowing the application to track message delivery.

### LangGraph Agent

The core of the application is a state machine built with LangGraph. This agent is composed of a series of nodes connected by conditional edges, allowing for complex and dynamic conversation flows.

**Key Nodes:**

-   `ingest_message`: The entry point for the graph. It processes the raw webhook payload, extracts the message content and user information, and saves it to the database.
-   `record_user_info`: If the user is responding to a question from the agent (e.g., providing their gender), this node records the information in the database.
-   `route_intent`: A critical routing node. It analyzes the user's message to determine their intent (e.g., asking for a "vibe check," styling advice, or just chatting).
-   `ask_user_info`: If the agent needs more information to fulfill a request (e.g., the user's gender), this node generates a question to ask the user.
-   `route_general`: A sub-router that handles general conversational intents like greetings, questions, or menu requests.
-   `route_styling`: A sub-router for all fashion-related queries. It directs the flow based on whether the user wants to pair an item, get vacation packing advice, or get help for a specific occasion.
-   `handle_general`: Processes general, non-fashion-related messages.
-   `handle_styling`: The main handler for all styling-related intents. It uses the OpenAI API to generate personalized fashion advice.
-   `vibe_check`: Handles outfit photo analysis. It takes an image, sends it to the OpenAI Vision API, and returns a detailed critique.
-   `color_analysis`: Performs a seasonal color analysis based on a user's photo.
-   `send_reply`: The final node in the graph. It takes the generated response from one of the handler nodes and sends it to the user via Twilio.

## Getting Started

### Prerequisites

-   Node.js (v20 or higher recommended)
-   npm
-   PostgreSQL database
-   Twilio Account with an active WhatsApp Business Number
-   OpenAI API Key
-   `ngrok` (for local development)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd broadway_copilot
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Generate the Prisma client:
    ```bash
    npx prisma generate
    ```

### Environment Variables

Create a `.env` file in the root of the project and add the following variables:

```
# OpenAI (Required)
OPENAI_API_KEY=

# Twilio (Required)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Database (Required)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public

# Server Configuration (Optional)
PORT=8080
LOG_LEVEL=debug
NODE_ENV=development

# --- Optional Twilio configuration ---
# Set to false to skip webhook signature validation (useful for local testing)
TWILIO_VALIDATE_WEBHOOK=true

# Optional Twilio timeouts (in milliseconds)
TWILIO_HTTP_TIMEOUT_MS=10000
TWILIO_SENT_TIMEOUT_MS=15000
TWILIO_DELIVERED_TIMEOUT_MS=60000
```

**Variable Explanations:**

-   `TWILIO_VALIDATE_WEBHOOK`: Set to `true` to enforce Twilio request signature validation. Recommended for production.
-   `TWILIO_*_TIMEOUT_MS`: Advanced settings to control how long the application waits for various stages of the message sending process.

## Usage

### Running Locally

1.  Start the development server:
```bash
npm run dev
```

2.  Expose your local server to the internet using ngrok:
```bash
ngrok http 8080
    ```

3.  Configure your Twilio WhatsApp number's webhook to point to the ngrok URL (e.g., `https://<your-ngrok-id>.ngrok.io/twilio/`).

### Available Scripts

-   `npm run dev`: Starts the development server with hot-reloading.
-   `npm run build`: Compiles the TypeScript code to JavaScript.
-   `npm start`: Starts the production server (requires a prior build).
-   `npm run graph`: Generates a visualization of the LangGraph agent (`langgraph.png`).
-   `npx prisma migrate dev`: Runs database migrations in a development environment.
-   `npx prisma migrate deploy`: Applies database migrations in a production environment.

## API Endpoints

-   `POST /twilio/`: The main webhook for incoming WhatsApp messages from Twilio. It authenticates requests, handles rate limiting, and queues messages for processing by the agent.
-   `POST /twilio/callback/`: An endpoint for Twilio to send status updates about message delivery.
-   `GET /uploads/*`: Serves static files from the `uploads` directory, making user-uploaded images accessible.

## Database Schema

The database schema is managed with Prisma and is designed to support a rich, multi-turn conversational experience.

**Core Models:**

-   **User**: The central model, representing a WhatsApp user. It stores the user's WhatsApp ID and any profile information the agent learns over time.
-   **Conversation**: Represents a single conversation session with a user. Each time a user starts interacting with the agent after a period of inactivity, a new conversation is created. It is linked to a `User`.
-   **Message**: Represents a single message within a `Conversation`. It stores the content, who sent it (`role`), and any identified `intent`. Each message is linked to a `Conversation`.

**Supporting Models:**

-   **Media**: If a user sends an image, this model stores information about it, including its Twilio URL and where it's stored on the application server. It is linked to a `Message`.
-   **VibeCheck** & **ColorAnalysis**: These models store the structured JSON output from the AI when it performs an outfit or color analysis. They are linked to a `User`.
-   **WardrobeItem**: Stores items from a user's digital wardrobe, including properties like category, color, and type. It is linked to a `User`.
-   **Memory**: A key-value store for long-term facts the agent remembers about a user.
-   **GraphRun** & **LLMTrace**: These models are used for detailed logging and debugging. `GraphRun` logs the state of the agent at the beginning and end of each run, while `LLMTrace` logs the raw requests and responses to the OpenAI API.

For a complete and detailed schema, refer to the `prisma/schema.prisma` file.

## Key Components

-   `src/index.ts`: The main entry point for the Express server. It sets up middleware, defines the Twilio webhook routes, and contains the core message queuing and processing logic.
-   `src/agent/graph.ts`: The heart of the AI. It defines the structure and logic of the LangGraph agent, including all the nodes and the conditional edges that connect them, dictating the flow of conversation.
-   `src/agent/nodes/`: This directory contains the implementation for each node in the LangGraph agent. Each file corresponds to a specific task (e.g., `ingestMessage.ts`, `routeIntent.ts`, `vibeCheck.ts`).
-   `src/lib/`: Contains modules for interacting with external services. `prisma.ts` configures the Prisma client, `redis.ts` manages the connection to Redis, and `twilio.ts` provides a wrapper around the Twilio client.
-   `src/utils/`: A collection of utility functions used throughout the application, for tasks such as structured logging (`logger.ts`), handling media uploads (`media.ts`), and loading prompts (`prompts.ts`).
-   `prompts/`: A directory of `.txt` files containing the system prompts that are used to instruct the OpenAI models on how to perform various tasks, such as analyzing an outfit or determining a user's intent.
-   `prisma/schema.prisma`: The definitive source of truth for the database schema. It defines all the models, their fields, and the relationships between them.

## Deployment

### Docker

The project includes a multi-stage `Dockerfile` for building optimized, production-ready Docker images.

-   **Build the image:**
```bash
docker build -t broadway-copilot .
```
-   **Run the container:**
```bash
    docker run --rm -p 8080:8080 --env-file .env broadway-copilot
    ```

### Google Cloud Run

The repository is configured for continuous deployment to Google Cloud Run using GitHub Actions. The workflow in `.github/workflows/google-cloudrun-deploy.yml` automates the process of building and deploying the Docker container.

**Prerequisites:**
-   A Google Cloud project with the Artifact Registry and Cloud Run APIs enabled.
-   A service account with the necessary permissions for deployment.
-   The required secrets configured in the GitHub repository settings.

## Troubleshooting

-   **Twilio Webhook Errors**: Ensure `ngrok` is running and the webhook URL is correctly configured in your Twilio console. If you're having signature validation issues during local development, you can temporarily set `TWILIO_VALIDATE_WEBHOOK=false` in your `.env` file.
-   **Database Connection Issues**: Verify that your `DATABASE_URL` is correct and that the PostgreSQL server is accessible.
-   **Prisma Client Not Found**: Run `npx prisma generate` after installing dependencies or making changes to the schema.
-   **Agent Visualization**: If the `langgraph.png` diagram is out of date, run `npm run graph` to regenerate it.
