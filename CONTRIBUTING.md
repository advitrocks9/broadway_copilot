# Contributing to Broadway Copilot

This guide covers everything you need to set up, run, and contribute to Broadway Copilot. For architecture and design overview, see the [README](README.md).

---

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Configure Environment](#configure-environment)
  - [Launch the Stack](#launch-the-stack)
  - [Twilio and Ngrok Setup](#twilio-and-ngrok-setup)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
  - [Service Topology](#service-topology)
  - [Common Commands](#common-commands)
  - [Running Without Docker](#running-without-docker)
- [Deployment](#deployment)
  - [Docker Image](#docker-image)
  - [Google Cloud Run](#google-cloud-run)
- [Observability and Troubleshooting](#observability-and-troubleshooting)
- [Extending the Agent](#extending-the-agent)
- [External Integrations](#external-integrations)
- [Quality Gates](#quality-gates)
- [Code Style](#code-style)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Architecture Notes](#architecture-notes)

---

## Getting Started

### Prerequisites

- Docker Desktop, or Docker Engine + Docker Compose v2
- Twilio account with WhatsApp sandbox or production sender
- Ngrok account (free tier works) for secure tunneling
- OpenAI and/or Groq API keys

### Configure Environment

1. Duplicate the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Fill in the required variables. See the [Environment Variables](#environment-variables) section below for the full reference.

### Launch the Stack

```bash
docker compose up --build
```

Compose starts four services:

- **app** -- Node.js dev container (installs deps, runs Prisma migrations, launches `npm run dev`).
- **db** -- PostgreSQL 17 with the pgvector extension.
- **redis** -- Redis 8 for queues, locks, and rate limiting.
- **ngrok** -- Exposes the Express server and prints the public HTTPS URL.

Watch the `app` logs for `Ngrok tunnel ready` and note the printed URL.

Shut the stack down with `docker compose down` (add `-v` to reset Postgres and Redis volumes).

### Twilio and Ngrok Setup

1. In the [Twilio Console](https://www.twilio.com/console), enable the WhatsApp sandbox or request a production sender.
2. Configure the **Webhook URL** to `https://<ngrok-domain>/twilio/` with method `POST`.
3. Configure the **Status Callback URL** to `https://<ngrok-domain>/twilio/callback/` with method `POST`.
4. Send a WhatsApp message to your Twilio number -- requests will now reach the local agent.

---

## Environment Variables

All variables are defined in `.env.example`. Copy it to `.env` and fill in the values relevant to your setup.

| Variable | Purpose | Requirement | Notes / Defaults |
|----------|---------|-------------|------------------|
| `SERVER_URL` | Base URL the app uses when building absolute links (Twilio callbacks, media URLs). | Required | Defaults to `http://localhost:8080`; switch to your ngrok or Cloud Run URL in staging/prod. |
| `NODE_ENV` | Enables development shortcuts (skips Cloud Tasks, relaxed logging). | Required | `development` locally; set to `production` in Cloud Run. |
| `PORT` | Express listen port. | Required | Defaults to `8080`; must match any Docker/forwarding config. |
| `DATABASE_URL` | PostgreSQL connection string. | Required | Compose injects its own DSN; override to point at Cloud SQL or another instance. |
| `REDIS_URL` | Redis connection string. | Required | Compose injects `redis://redis:6379`; replace with your Memorystore or standalone Redis in prod. |
| `TWILIO_ACCOUNT_SID` | Twilio account identifier for REST + webhook validation. | Required | Required to send/receive WhatsApp messages. |
| `TWILIO_AUTH_TOKEN` | Twilio auth token used for REST + signature checks. | Required | Required. |
| `TWILIO_WHATSAPP_FROM` | Default WhatsApp sender (sandbox or production number). | Required | Sandbox default `whatsapp:+14155238886` is prefilled. |
| `TWILIO_VALIDATE_WEBHOOK` | Toggle signature validation for incoming webhooks. | Optional | Keep `true` in prod; set `false` locally if tunneling causes signature mismatch. |
| `TWILIO_WAIT_FOR_STATUS` | Whether the agent waits for Twilio status callbacks before deeming a reply delivered. | Optional | `true` by default; flip to `false` for faster local iterations. |
| `TWILIO_HTTP_TIMEOUT_MS` | REST timeout for outbound Twilio requests. | Optional | Default `10000` (10 s). |
| `TWILIO_SENT_TIMEOUT_MS` | How long to wait for a `sent` callback before treating a message as stalled. | Optional | Default `15000` (15 s). |
| `TWILIO_DELIVERED_TIMEOUT_MS` | How long to wait for a `delivered` callback before giving up. | Optional | Default `60000` (60 s). |
| `FEEDBACK_REQUEST_DELAY_MS` | Delay before the feedback Cloud Task is queued after a conversation. | Optional | Default `60000` (1 min). |
| `OPENAI_API_KEY` | OpenAI access token for chat, vision, embeddings, and Cloud Functions. | Optional | Provide if you want OpenAI models; at least one of OpenAI/Groq must be set. |
| `GROQ_API_KEY` | Groq access token for fast chat completions. | Optional | Provide if you want Groq models; at least one of OpenAI/Groq must be set. |
| `NGROK_AUTHTOKEN` | Auth token so the Dockerized ngrok agent can start a tunnel. | Optional | Required if you use the bundled ngrok container. |
| `CLOUD_TASKS_SERVICE_ACCOUNT` | Service account email used when Cloud Tasks calls your Cloud Functions. | Production only | Required for production async flows; skip locally. |
| `CLOUD_FUNCTION_REGION` | Region where Cloud Functions are deployed (used to build their URLs). | Production only | Defaults to `asia-south2`; match your deployment region. |
| `CLOUD_TASKS_REGION` | Region for Cloud Tasks queues. | Production only | Example uses `asia-south1`; ensure it matches the queues you create. |
| `PROJECT_ID` | Google Cloud project that owns Cloud Run, Functions, Tasks, and databases. | Production only | Defaults to `broadway-chatbot`. |

---

## Local Development

### Service Topology

The backend expects the following supporting services:

| Service | Purpose | Default Source |
|---------|---------|----------------|
| Express app | HTTP API, webhook ingestion, agent runner | `app` container (`npm run dev`) |
| PostgreSQL | Conversation and tracing database | `db` container (port 5432, user `postgres`/`postgres`) |
| Redis | Rate limiting, message queues, abort signals | `redis` container (port 6379) |
| Ngrok | Secure tunnel for Twilio callbacks | `ngrok` container (port 4040 admin UI, development only) |

### Common Commands

All commands run inside the `app` container by default when using Compose. Run them from the host with `docker compose exec app <command>` if needed.

| Command | Purpose |
|---------|---------|
| `npm ci` | Install dependencies (already handled at container build) |
| `npm run dev` | Start the Express server with hot reload (default compose command) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Lint the codebase (ESLint) |
| `npm run format` | Auto-format with Prettier |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run unit tests (Vitest) |
| `npx prisma generate` | Regenerate Prisma client after schema changes |
| `npx prisma migrate dev` | Create and apply a new migration |
| `npx prisma studio` | Inspect data in the browser during development |
| `npm run graph` | Regenerate `langgraph.png` from the current state graph |

### Running Without Docker

If you prefer running on the host:

1. Install dependencies with `npm ci`.
2. Provide Postgres and Redis instances (local or remote) and set `DATABASE_URL` / `REDIS_URL` accordingly.
3. Run migrations: `npx prisma migrate deploy` or `npx prisma db push` for dev sync.
4. Start the server with `npm run dev`.

You will still need ngrok (or another reverse proxy) to expose your local server to Twilio. Cloud Run automatically handles this in production.

---

## Deployment

### Docker Image

Build and run locally using the production Docker image:

```bash
docker build -t broadway-copilot .
docker run --rm -p 8080:8080 --env-file .env broadway-copilot
```

### Google Cloud Run

Automated deployments are configured via `.github/workflows/google-cloudrun-deploy.yml`.

**Requirements:**

- Google Cloud project with Artifact Registry and Cloud Run APIs enabled.
- Service account with permissions to push to Artifact Registry and deploy to Cloud Run.
- GitHub Actions secrets set for GCP credentials, project ID, and service configuration.
- Workload Identity Federation configured for keyless authentication from GitHub Actions.

The workflow builds the Docker image, pushes it to Artifact Registry, and deploys the latest tag to Cloud Run with VPC, secret, and scaling configuration.

Cloud Functions are deployed via a separate workflow (`.github/workflows/google-cloudfunctions-deploy.yml`), triggered for changes under `functions/**`.

---

## Observability and Troubleshooting

**Structured Logging:** All services log via `src/utils/logger.ts` (pino). Logs include Twilio IDs, user IDs, and node names for traceability.

**Tracing Database:** Inspect `GraphRun`, `NodeRun`, and `LLMTrace` tables to replay agent runs and review raw LLM payloads. See [TRACING.md](TRACING.md) for the full tracing architecture.

**Redis Keys:**

| Key Pattern | Purpose |
|-------------|---------|
| `message:<MessageSid>` | Status hash for a message |
| `user_active:<WaId>` | Message currently being processed for a user |
| `user_queue:<WaId>` | Pending messages for a user |
| `twilio:status:<sid>` | Delivery tracking channel |
| `twilio:seen:<sid>` | Delivery deduplication channel |
| `user_abort:<WaId>` | Publish to this channel to cancel an active run |

**Common Issues:**

- **Signature validation failures** -- Ensure the ngrok domain matches `SERVER_URL`. Temporarily disable via `TWILIO_VALIDATE_WEBHOOK=false` for local debugging.
- **Messages stuck in `running`** -- Inspect Redis keys above and confirm abort signals fire correctly.
- **LLM errors** -- Check `LLMTrace.errorTrace` and verify API usage limits.
- **Media download failures** -- Verify Twilio MMS permissions and that `uploads/` is writable.

---

## Extending the Agent

1. **Add a Node**
   - Implement `async function nodeName(state: GraphState)` in `src/agent/nodes/`.
   - Register the node and new edges in `src/agent/graph.ts`.
   - Update prompts/tools as needed.
2. **Add a Tool**
   - Create a new tool in `src/agent/tools.ts` (or alongside its consumer) using the LangChain tool interface.
   - Inject it where relevant when constructing the agent executor.
3. **Persist New Data**
   - Update `functions/prisma/schema.prisma`, regenerate the Prisma client, and run migrations.
   - Surface the new data in tracing or responses if needed for observability.
4. **Support Another LLM Provider**
   - Follow the pattern under `src/lib/ai/openai/` or `src/lib/ai/groq/` to implement a provider.
   - Register it in the factories under `src/lib/ai/config/llm.ts`.

---

## External Integrations

- **Twilio** -- Primary messaging channel. Configure webhook URLs to point at the running server. Signature validation can be toggled via `TWILIO_VALIDATE_WEBHOOK`.
- **Ngrok** -- Provides a stable HTTPS endpoint for local development. Token is required for the bundled ngrok container to start.
- **LLM Providers** -- OpenAI and Groq chat/vision models are supported. Select providers within `src/lib/ai/config/llm.ts`.
- **Google Cloud Tasks** -- Asynchronous execution path used for memory extraction, wardrobe indexing, image uploads, and feedback requests (`src/lib/tasks.ts`). In development the calls short-circuit; production requires service account credentials and queue configuration.

---

## Quality Gates

Before submitting a PR, ensure all checks pass:

```bash
npm run lint        # No lint errors
npm run typecheck   # No type errors
npm run build       # Compiles cleanly
npm test            # Tests pass
```

If your change touches Cloud Functions, also run:
```bash
cd functions && npm run build
```

---

## Code Style

- **TypeScript strict mode** is enabled -- no `any` types, explicit return types on exported functions.
- **Prettier** handles formatting (100-char width, single quotes, trailing commas). Run `npm run format` before committing.
- **ESLint** with `@typescript-eslint` enforces style rules. See `eslint.config.mjs` for details.
- **Pino** is the logger -- use `logger.info()`, `logger.error()`, etc. Never use `console.log` in production code.
- **JSDoc** comments are expected on all exported functions, especially in `src/agent/` and `src/lib/`.

---

## Pull Request Guidelines

1. **Keep PRs focused** -- one feature or fix per PR.
2. **Write a clear title** and description explaining what changed and why.
3. **Reference issues** if applicable (`Fixes #123`).
4. **Add tests** for new utility functions or bug fixes when possible.
5. **Don't break the build** -- all quality gates must pass.

---

## Architecture Notes

Before making structural changes, familiarize yourself with:

- **[README -- Architecture](README.md#architecture--request-lifecycle)** -- Request lifecycle and agent flow.
- **[TRACING.md](TRACING.md)** -- Agent tracing infrastructure (GraphRun, NodeRun, LLMTrace).
- **[src/lib/ai/README.md](src/lib/ai/README.md)** -- LLM abstraction layer documentation.

For larger architectural changes, please open a GitHub Issue or Discussion first so we can align on the approach before you write code.

---

## Questions?

Open a [GitHub Issue](../../issues) for bugs or feature requests, or start a [Discussion](../../discussions) for broader questions.
