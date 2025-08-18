# Broadway Copilot

This is a WhatsApp bot that acts as a personal stylist. It uses AI to understand user queries, analyze images, and provide fashion advice.

## How It Works

The core of the bot is an AI agent built with LangChain. The agent is a state machine that processes user messages and decides what to do next. The flow is as follows:

1.  **Ingest Message**: A new message from WhatsApp is received by the Express API, which passes it to the agent.
2.  **Infer Profile**: The agent infers user profile information from the message.
3.  **Route Intent**: The agent determines the user's intent (e.g., asking for a style suggestion, an opinion on an outfit, etc.).
4.  **Handle Intent**: Based on the intent, the agent routes the message to the appropriate handler. Handlers exist for various intents like `occasion`, `vacation`, `pairing`, `suggest`, `vibe_check`, and `color_analysis`.
5.  **Send Reply**: The handler generates a response, which is sent back to the user via Twilio's WhatsApp API.

The project uses Prisma to interact with a SQLite database, which stores information about users, their wardrobe, and conversations.

## Project Layout

The project is structured as follows:

```
broadway_copilot/
├── prisma/               # Prisma schema and migrations
├── scripts/              # Helper scripts
├── src/
│   ├── agent/            # Core AI agent logic (LangChain graph and nodes)
│   ├── api/              # Express API for handling webhooks
│   ├── db/               # Prisma client
│   ├── prompts/          # Prompts for the LLM
│   ├── services/         # Services for interacting with external APIs (Twilio, etc.)
│   ├── types/            # TypeScript types and interfaces
│   └── utils/            # Utility functions
├── package.json
└── tsconfig.json
```

## Getting Started

To get the project up and running, follow these steps:

### 1. Prerequisites

- Node.js
- npm
- [ngrok](https://ngrok.com/download)

### 2. Installation and Setup

1.  **Clone the repository**

    ```bash
    git clone <repository-url>
    cd broadway_copilot
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Set up the database**

    ```bash
    npm run prisma:migrate
    ```

4.  **Set up environment variables**

    Create a `.env` file in the root of the project and add the following secrets.

    ```
    OPENAI_API_KEY=
    TWILIO_ACCOUNT_SID=
    TWILIO_AUTH_TOKEN=
    TWILIO_CARD_SID=
    TWILIO_MENU_SID=
    ```

5.  **Run ngrok**

    Expose your local server to the internet using ngrok.

    ```bash
    ngrok http --url=dodo-proud-visually.ngrok-free.app 3000
    ```

    You will need to configure your Twilio WhatsApp number to send webhook requests to the ngrok URL.

### 3. Running the application

To start the development server, run:

```bash
npm run dev
```
