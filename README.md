## Broadway Copilot

Broadway Copilot is a WhatsApp personal stylist powered by LangGraph and OpenAI. It understands user intent, analyzes outfit photos, and returns responses via Twilio WhatsApp.

### Architecture

- **Express API**: Receives Twilio webhooks at `POST /twilio/` and serves static files under `/uploads`.
- **Agent (LangGraph)**: A state graph routes across nodes like `route_intent`, `vibe_check`, `color_analysis`, `handle_suggest`, and more.
- **Services**: Twilio messaging helpers and OpenAI clients.
- **Database**: Prisma + PostgreSQL for users, turns, uploads, color analysis, vibe checks, and wardrobe items.

![Agent Graph](./langgraph.png)

### Repository structure

```
broadway_copilot/
├── prisma/                Prisma schema and migrations
├── prompts/               Prompt files used by the agent
├── scripts/               Graph visualization script
├── src/
│   ├── agent/             LangGraph state machine and nodes
│   ├── api/               Express server, middleware, routes
│   ├── db/                Prisma client
│   ├── services/          Twilio and OpenAI services
│   ├── types/             Shared types
│   └── utils/             Utilities (logging, media, paths)
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 20+ (Node 22 recommended; Dockerfile uses 22-alpine)
- npm
- PostgreSQL database
- Twilio account with WhatsApp (sandbox or business number)
- ngrok (optional for local webhook testing)

## Environment variables

Create a `.env` at the repo root:

```
# OpenAI
OPENAI_API_KEY=

# Twilio core
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Optional Twilio Content Template SIDs (fallbacks to text if absent)
TWILIO_MENU_SID=
TWILIO_CARD_SID=

# Webhook signature validation (default true)
TWILIO_VALIDATE_WEBHOOK=true

# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public

# Server
PORT=8080
LOG_LEVEL=debug
NODE_ENV=development
```

Notes:
- If `TWILIO_VALIDATE_WEBHOOK=false`, signature checks are skipped, which helps for local testing/curl.
- `TWILIO_MENU_SID` and `TWILIO_CARD_SID` are optional; without them, replies fall back to plain text.

## Install and initialize

```bash
npm install
npx prisma generate
```

Run migrations locally (choose one):

```bash
# for active development
npx prisma migrate dev

# or to apply existing migrations
npx prisma migrate deploy
```

## Run locally

```bash
npm run dev
```

Expose your local server for Twilio using ngrok and point your WhatsApp webhook to it:

```bash
ngrok http 8080
# In Twilio Console, set the WhatsApp Inbound Webhook to:
# https://YOUR-NGROK-DOMAIN.ngrok.io/twilio/
```

To test without Twilio signatures, set `TWILIO_VALIDATE_WEBHOOK=false` and post a form-encoded body to `/twilio/`.

## Agent graph visualization

Render or refresh the graph image `langgraph.png`:

```bash
npm run graph
```

This uses `scripts/visualizeGraph.ts` to compile the LangGraph and write the PNG at the repo root.

## API

- `POST /twilio/`: Twilio webhook endpoint. Expects standard WhatsApp webhook params and validates the `X-Twilio-Signature` header by default.
- `GET /uploads/...`: Serves uploaded images saved under `uploads/`.

## Docker

Build and run locally:

```bash
docker build -t broadway-copilot .
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID \
  -e TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN \
  -e TWILIO_WHATSAPP_FROM=$TWILIO_WHATSAPP_FROM \
  -e TWILIO_MENU_SID=$TWILIO_MENU_SID \
  -e TWILIO_CARD_SID=$TWILIO_CARD_SID \
  -e DATABASE_URL=$DATABASE_URL \
  -e PORT=8080 \
  --name broadway-copilot broadway-copilot
```

The Dockerfile compiles TypeScript, copies `prompts/` and `prisma/`, generates the Prisma client at runtime, and starts the server.

## Deploy to Google Cloud Run

This repo includes a GitHub Actions workflow for Cloud Run. On push to `main`, it:
- Builds and pushes a container to Artifact Registry
- Deploys to Cloud Run service `broadway-chatbot` in region `asia-south2`
- Updates secrets `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `DATABASE_URL`

Required GitHub Actions repository secrets:
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `DATABASE_URL`

Ensure Workload Identity and Artifact Registry are configured to match `.github/workflows/google-cloudrun-docker.yml`.

## Key files

- `src/api/index.ts`: Express server and webhook handler
- `src/agent/graph.ts`: LangGraph state graph build and runner
- `src/agent/nodes/*`: Intent handlers and utilities
- `src/services/twilioService.ts`: Twilio client and send helpers
- `src/services/openaiService.ts`: Standardized OpenAI Chat/Vision clients
- `src/utils/media.ts`: Media download and OpenAI file upload helpers
- `prisma/schema.prisma`: Database models
- `scripts/visualizeGraph.ts`: Graph rendering script

## Troubleshooting

- 401 from Twilio: verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
- Signature failures: set correct webhook URL or temporarily `TWILIO_VALIDATE_WEBHOOK=false` for local testing.
- OpenAI file upload errors: ensure `OPENAI_API_KEY` is set and reachable.
- Prisma connection errors: verify `DATABASE_URL` and that the database is reachable from your environment.
