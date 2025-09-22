
# Broadway Copilot

  

Broadway Copilot is an AI-powered personal stylist that lives on WhatsApp. It combines a LangGraph-inspired conversational agent, OpenAI/Groq language models, computer vision features, and a rich data layer to deliver personalized fashion advice in real time.

  

![Agent Graph](./langgraph.png)

  

## Table of Contents

  

1. [At a Glance](#at-a-glance)

2. [Quick Start](#quick-start)

- [Prerequisites](#prerequisites)

- [Configure Environment](#configure-environment)

- [Launch the Stack](#launch-the-stack)

- [Twilio + Ngrok Setup](#twilio--ngrok-setup)

3. [Local Development](#local-development)

- [Service Topology](#service-topology)

- [Common Commands](#common-commands)

- [Running Without Docker](#running-without-docker)

4. [Architecture](#architecture)

- [Request Lifecycle](#request-lifecycle)

- [LangGraph Agent](#langgraph-agent)

- [Core Components](#core-components)

5. [Data & Persistence](#data--persistence)

6. [External Integrations](#external-integrations)

7. [Repository Layout](#repository-layout)

8. [Deployment](#deployment)

- [Docker Image](#docker-image)

- [Google Cloud Run](#google-cloud-run)

9. [Production Infrastructure](#production-infrastructure)

10. [CI/CD & Automation](#cicd--automation)

11. [Observability & Troubleshooting](#observability--troubleshooting)

12. [Extending the Agent](#extending-the-agent)

13. [Contributing](#contributing)

  

---

  

## At a Glance

  

-  **Channel:** WhatsApp via Twilio webhooks and status callbacks.

-  **Runtime:** Node.js Express server orchestrated with Docker Compose locally and deployed to Google Cloud Run (Gen 2) in production.

-  **Agent Brain:** LangGraph-inspired state machine coordinating specialized nodes for intent routing, outfit analysis, and personalized recommendations.

-  **Storage:** PostgreSQL with pgvector for conversations (Cloud SQL in prod), Redis for queues/rate limiting (Cloud Memorystore in prod), and Cloud Storage for media archiving.

-  **LLMs:** OpenAI for vision heavy tasks and Groq for quick conversational tasks.

-  **Infrastructure Targets:** Local Docker Compose, Google Cloud Run behind a private VPC, Cloud SQL + Cloud Memorystore via VPC connectors, Google Cloud Tasks, and Google Cloud Functions for async work.

  

---

  

## Quick Start

  

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

2. Fill in the variables from `.env.example` that matter for your setup:

  

| Variable | Purpose | Required for local dev? | Notes / Defaults |
| --- | --- | --- | --- |
| `SERVER_URL` | Base URL the app uses when building absolute links (Twilio callbacks, media URLs). | ✅ | Defaults to `http://localhost:8080`; switch to your ngrok or Cloud Run URL in staging/prod.
| `NODE_ENV` | Enables development shortcuts (skips Cloud Tasks, relaxed logging). | ✅ | `development` locally; set to `production` in Cloud Run.
| `PORT` | Express listen port. | ✅ | Defaults to `8080`; must match any Docker/forwarding config.
| `DATABASE_URL` | PostgreSQL connection string. | ✅ | Compose injects its own DSN; override to point at Cloud SQL or another instance.
| `REDIS_URL` | Redis connection string. | ✅ | Compose injects `redis://redis:6379`; replace with your Memorystore or standalone Redis in prod.
| `TWILIO_ACCOUNT_SID` | Twilio account identifier for REST + webhook validation. | ✅ | Required to send/receive WhatsApp messages.
| `TWILIO_AUTH_TOKEN` | Twilio auth token used for REST + signature checks. | ✅ | Required.
| `TWILIO_WHATSAPP_FROM` | Default WhatsApp sender (sandbox or production number). | ✅ | Sandbox default `whatsapp:+14155238886` is prefilled.
| `TWILIO_VALIDATE_WEBHOOK` | Toggle signature validation for incoming webhooks. | ⚙️ | Keep `true` in prod; set `false` locally if tunneling causes signature mismatch.
| `TWILIO_WAIT_FOR_STATUS` | Whether the agent waits for Twilio status callbacks before deeming a reply delivered. | ⚙️ | `true` by default; flip to `false` for faster local iterations.
| `TWILIO_HTTP_TIMEOUT_MS` | REST timeout for outbound Twilio requests. | ⚙️ | Default `10000` (10 s).
| `TWILIO_SENT_TIMEOUT_MS` | How long to wait for a `sent` callback before treating a message as stalled. | ⚙️ | Default `15000` (15 s).
| `TWILIO_DELIVERED_TIMEOUT_MS` | How long to wait for a `delivered` callback before giving up. | ⚙️ | Default `60000` (60 s).
| `FEEDBACK_REQUEST_DELAY_MS` | Delay before the feedback Cloud Task is queued after a conversation. | ⚙️ | Default `60000` (1 min).
| `OPENAI_API_KEY` | OpenAI access token for chat, vision, embeddings, and Cloud Functions. | ⚙️ | Provide if you want OpenAI models; at least one of OpenAI/Groq must be set.
| `GROQ_API_KEY` | Groq access token for fast chat completions. | ⚙️ | Provide if you want Groq models; at least one of OpenAI/Groq must be set.
| `NGROK_AUTHTOKEN` | Auth token so the Dockerized ngrok agent can start a tunnel. | ⚙️ | Required if you use the bundled ngrok container.
| `CLOUD_TASKS_SERVICE_ACCOUNT` | Service account email used when Cloud Tasks calls your Cloud Functions. | 🚀 | Required for production async flows; skip locally.
| `CLOUD_FUNCTION_REGION` | Region where Cloud Functions are deployed (used to build their URLs). | 🚀 | Defaults to `asia-south2`; match your deployment region.
| `CLOUD_TASKS_REGION` | Region for Cloud Tasks queues. | 🚀 | Example uses `asia-south1`; ensure it matches the queues you create.
| `PROJECT_ID` | Google Cloud project that owns Cloud Run, Functions, Tasks, and databases. | 🚀 | Defaults to `broadway-chatbot`.

Legend: ✅ required for local dev, ⚙️ configurable but recommended, 🚀 production-only knobs.

  

Optional Google Cloud variables are only needed when you enable the production async pipeline (Cloud Tasks + Cloud Functions).

  

### Launch the Stack

  

```bash

docker  compose  up  --build

```

  

Compose starts four services:

  

-  **app** – Node.js dev container (installs deps, runs Prisma migrations, launches `npm run dev`).

-  **db** – PostgreSQL 17 with the pgvector extension.

-  **redis** – Redis 8 for queues, locks, and rate limiting.

-  **ngrok** – Exposes the Express server and prints the public HTTPS URL.

  

Watch the `app` logs for `Ngrok tunnel ready` and note the printed URL.

  

Shut the stack down with `docker compose down` (add `-v` to reset Postgres and Redis volumes).

  

### Twilio & Ngrok Setup

  

1. In the [Twilio Console](https://www.twilio.com/console), enable the WhatsApp sandbox or request a production sender.

2. Configure the **Webhook URL** to `https://<ngrok-domain>/twilio/`. with `POST`

3. Configure the **Status Callback URL** to `https://<ngrok-domain>/twilio/callback/`. with `POST`

4. Send a WhatsApp message to your Twilio number—requests will now reach the local agent.

  

---

  

## Local Development

  

### Service Topology

  

The backend expects the following supporting services:

  

| Service | Purpose | Default Source |

| --- | --- | --- |

| Express app | HTTP API, webhook ingestion, agent runner | `app` container (`npm run dev`) |

| PostgreSQL | Conversation and tracing database | `db` container (port 5432, user `postgres`/`postgres`) |

| Redis | Rate limiting, message queues, abort signals | `redis` container (port 6379) |

| Ngrok | Secure tunnel for Twilio callbacks | `ngrok` container (port 4040 admin UI) | ( only in development )

  

### Common Commands

  

All commands run inside the `app` container by default when using Compose. Run them from the host with `docker compose exec app <command>` if needed.

  

| Command | Purpose |

| --- | --- |

| `npm ci` | Install dependencies (already handled at container build) |

| `npm run dev` | Start the Express server with hot reload (default compose command) |

| `npm run build` | Compile TypeScript to `dist/` |

| `npm run lint` | Lint the codebase |

| `npx prisma generate` | Regenerate Prisma client after schema updates |

| `npx prisma migrate dev` | Create and apply a new migration locally |

| `npm run graph` | Regenerate `langgraph.png` from the current state graph |

  

### Running Without Docker

  

If you prefer running on the host:

  

1. Install dependencies with `npm ci`.

2. Provide Postgres and Redis instances (local or remote) and set `DATABASE_URL` / `REDIS_URL` accordingly.

3. Run migrations: `npx prisma migrate deploy` or `npx prisma db push` for dev sync.

4. Start the server with `npm run dev`.

  

You will still need ngrok (or another reverse proxy) to expose your local server to Twilio. ( Cloud run automatically sets this up )

  

---

  

## Architecture

  

### Request Lifecycle

  

1.  **Inbound Webhook (`src/index.ts`)** – Validates Twilio signatures (`middleware/auth.ts`), applies rate limiting and whitelist checks, deduplicates message SIDs, and enqueues work per user.

2.  **Concurrency Control** – Redis-backed locks ensure only one message per user is processed at a time. New messages abort the currently running agent via `user_abort:<WaId>` pub/sub.

3.  **Agent Execution** – `runAgent` loads user + conversation context, seeds a `GraphRun` record, then executes the LangGraph state machine defined in `src/agent/graph.ts`.

4.  **Node Processing** – Specialized nodes handle tasks such as intent routing, profile inference, outfit analysis, and response crafting. Nodes may call external services (LLMs, image analysis) or interact with the database.

5.  **Reply Delivery** – Once the agent emits a response, the `send_reply` node leverages `src/lib/twilio.ts` to send text, menu, or image messages. Optional delivery confirmation subscribes to Twilio status callbacks via Redis channels.

6.  **Tracing & Persistence** – Message transcripts, node runs, and LLM interactions are persisted in Postgres (`GraphRun`, `NodeRun`, `LLMTrace`) for replay and debugging.

  

### LangGraph Agent

  

-  **Graph Definition:**  `src/agent/graph.ts` wires nodes with conditional edges for complex branching conversations.

-  **Representative Nodes:**

-  `ingestMessage` – Normalizes the webhook payload and stores the inbound message.

-  `recordUserInfo` – Captures user-provided slots (e.g., gender, style preferences).

-  `inferProfile` – Passively updates long-term profile attributes from conversation history.

-  `routeIntent` – Selects specialized flows (vibe check, color analysis, outfit help, etc.).

-  `vibeCheck` / `colorAnalysis` – Run LLM + vision prompts and store structured outputs (`VibeCheck`, `ColorAnalysis`).

-  `sendReply` – Chooses response modality and enqueues follow-up actions when necessary.

-  **Tools & Integrations:** Custom LangChain-style tools live in `src/agent/tools.ts`, while prompts are stored under `prompts/` and loaded via `utils/prompts.ts`.

  

### Core Components

  

| Location | Responsibility |

| --- | --- |

| `src/index.ts` | Express app bootstrap, Twilio webhook routing, message queue management |

| `src/agent/` | LangGraph definition, node implementations, helper utilities |

| `src/lib/prisma.ts` | Prisma client with connection caching |

| `src/lib/redis.ts` | Redis client + helper utilities for locking and pub/sub |

| `src/lib/twilio.ts` | Twilio REST helpers (text, image, menu replies) |

| `src/lib/ai/` | OpenAI/Groq client wrappers and configuration factories |

| `src/utils/` | Shared helpers for logging, media downloads, structured context management |

| `functions/` | Google Cloud Functions used for wardrobe indexing, memory extraction, and other background tasks |

  

---

  

## Data & Persistence

  

Prisma manages the relational schema (source of truth lives in `functions/prisma/schema.prisma`). Key models include:

  

-  **User** – WhatsApp contact metadata and inferred profile attributes.

-  **Conversation** – Session groupings for messages, reset after inactivity.

-  **Message** – Individual inbound/outbound messages with role, intent, and media references.

-  **Media** – Metadata and storage pointers for user-uploaded images.

-  **VibeCheck / ColorAnalysis** – Structured analysis outputs produced by the agent.

-  **WardrobeItem** – Catalog of a user’s wardrobe items with descriptors.

-  **Memory** – Key-value store for long-term facts.

-  **GraphRun / NodeRun / LLMTrace** – Tracing artifacts for debugging agent executions.

  

Run `npx prisma studio` (inside the container) to inspect data during development.

  

---

  

## External Integrations

  

-  **Twilio** – Primary messaging channel. Configure webhook URLs to point at the running server. Signature validation can be toggled via `TWILIO_VALIDATE_WEBHOOK`.

-  **Ngrok** – Provides a stable HTTPS endpoint for local development. Token is required for the bundled ngrok container to start.

-  **LLM Providers** – OpenAI and Groq chat/vision models are supported. Select providers within `src/lib/ai/config/llm.ts`.

-  **Google Cloud Tasks** – Optional asynchronous execution path used for memory extraction and wardrobe indexing (`src/lib/tasks.ts`). In development the calls short-circuit; production requires service account credentials and queue configuration.

  

---

  

## Repository Layout

  

```

.

├── docker-compose.yml # Local orchestration for app + infra + ngrok

├── src/ # Express API, agent graph, shared libraries

│ ├── agent/ # LangGraph definition, nodes, and tools

│ ├── lib/ # Twilio, Redis, Prisma, AI helpers

│ ├── middleware/ # Auth, rate limiting, whitelist checks

│ ├── utils/ # Context, logging, media, prompt loaders

│ └── index.ts # HTTP entrypoint and message queue bootstrap

├── functions/ # Cloud Functions (memories, wardrobe indexing)

├── prompts/ # Prompt templates consumed by agent nodes

├── functions/prisma/ # Prisma schema and migrations (authoritative)

├── prisma/ # Generated Prisma client artifacts

├── uploads/ # Local storage for downloaded media (gitignored)

└── README.md # This document

```

  

---

  

## Deployment

  

### Docker Image

  

Build and run locally using the production Docker image:

  

```bash

docker  build  -t  broadway-copilot  .

docker  run  --rm  -p  8080:8080  --env-file  .env  broadway-copilot

```

  

### Google Cloud Run

  

Automated deployments are configured via `.github/workflows/google-cloudrun-deploy.yml`.

  

**Requirements:**

  

- Google Cloud project with Artifact Registry and Cloud Run APIs enabled.

- Service account with permissions to push to Artifact Registry and deploy to Cloud Run.

- GitHub Actions secrets set for GCP credentials, project ID, and service configuration.

  

The workflow builds the Docker image, pushes it to Artifact Registry, and deploys the latest tag to Cloud Run.

  

---

  

## Production Infrastructure

  

-  **Application Runtime:** Cloud Run Gen 2 service `broadway-chatbot` runs with 2 vCPUs, 4 Gi RAM, concurrency of 8, and `min-instances=1` to keep the agent warm.

-  **Private Networking:** Deployments attach to the `chatbot-vpc` network and `chatbot-subnet`, restrict egress to private ranges, and use a dedicated service account so outbound calls to Cloud SQL, Cloud Memorystore, and internal APIs stay on private IP space.

-  **Data Plane:** Regional Cloud SQL for PostgreSQL (pgvector enabled) stores conversations, traces, and wardrobe data. Cloud Memorystore (Redis) provides queues, locks, and abort channels. Both resources are reached through the VPC connector configured on Cloud Run.

-  **Async Workers:** Google Cloud Tasks triggers background Cloud Functions (`functions/src`) for image uploads, memory extraction, wardrobe indexing, and post-conversation feedback. Each task writes lifecycle events to the `Task` table so the agent can react to completions or retries.

-  **Media & Assets:** User-uploaded images are persisted to Cloud Storage buckets in production while mirrored to `uploads/` when running locally.

-  **Secrets & Config:** Runtime secrets (Twilio, LLM keys, database URLs) come from Secret Manager. Feature flags—`TWILIO_VALIDATE_WEBHOOK`, `TWILIO_WAIT_FOR_STATUS`, task delays—are injected as Cloud Run environment variables.

  

---

  

## CI/CD & Automation

  

-  **Cloud Run Deploy (`.github/workflows/google-cloudrun-deploy.yml`):** On every push to `main`, GitHub Actions authenticates with Workload Identity Federation, builds the container, publishes to Artifact Registry, and deploys to Cloud Run with the VPC, secret, and scaling configuration above.

-  **Cloud Functions Deploy (`.github/workflows/google-cloudfunctions-deploy.yml`):** Triggered for changes under `functions/**`, this workflow installs dependencies, builds TypeScript, and redeploys the task handlers (`imageUpload`, `storeMemories`, `indexWardrobe`, `sendFeedbackRequest`) with secrets from Secret Manager.

-  **Automated Releases:** Merges to `main` re-deploy both the chat service and any updated Cloud Functions, so approved pull requests roll out to production without extra steps.

  

---

  

## Observability & Troubleshooting

  

-  **Structured Logging:** All services log via `src/utils/logger.ts` (pino). Logs include Twilio IDs, user IDs, and node names for traceability.

-  **Tracing Database:** Inspect `GraphRun`, `NodeRun`, and `LLMTrace` tables to replay agent runs and review raw LLM payloads.

-  **Redis Keys:**

-  `message:<MessageSid>` – Hash of status fields (queued, running, sending, delivered/failed).

-  `user_active:<WaId>` – Tracks the message currently being processed for a user.

-  `user_queue:<WaId>` – Pending messages waiting for execution.

-  `twilio:status:<sid>` / `twilio:seen:<sid>` – Delivery tracking channels.

- Publish to `user_abort:<WaId>` to cancel an active run.

-  **Common Issues:**

- Signature validation failures → ensure ngrok domain matches `SERVER_URL`; temporarily disable via `TWILIO_VALIDATE_WEBHOOK=false` for local debugging.

- Messages stuck in `running` → inspect Redis keys above and confirm abort signals fire.

- LLM errors → check `LLMTrace.errorTrace` and API usage limits.

- Media download failures → verify Twilio MMS permissions and that `uploads/` is writable.

  

---

  

## Extending the Agent

  

1.  **Add a Node**

- Implement `async function nodeName(state: GraphState)` in `src/agent/nodes/`.

- Register the node and new edges in `src/agent/graph.ts`.

- Update prompts/tools as needed.

  

2.  **Add a Tool**

- Create a new tool in `src/agent/tools.ts` (or alongside its consumer) using the LangChain tool interface.

- Inject it where relevant when constructing the agent executor.

  

3.  **Persist New Data**

- Update `functions/prisma/schema.prisma`, regenerate the Prisma client, and run migrations.

- Surface the new data in tracing or responses if needed for observability.

  

4.  **Support Another LLM Provider**

- Follow the pattern under `src/lib/ai/openai/` or `src/lib/ai/groq/` to implement a provider.

- Register it in the factories under `src/lib/ai/config/llm.ts`.

  

---

  

## Contributing

  

-  **Fork & Branch:** Create a fork, clone it locally, and branch from `main` (`git checkout -b feature/xyz`).

-  **Environment:** Copy `.env.example`, supply local Twilio + LLM keys, and ensure Postgres/Redis are running (via Docker Compose or your own instances).

-  **Quality Gates:** Run `npm run lint` and `npm run build` from the repo root and, if your change touches Cloud Functions, run `npm run build` inside `functions/`.

-  **Pull Request:** Open a PR against `main`. Once approved and merged, GitHub Actions automatically redeploys Cloud Run and any touched Cloud Functions via the workflows above—no manual release needed.

-  **Discussions:** Use GitHub Issues/Discussions to propose bigger architectural changes so we can align on trace schema, agent graphs, or infra adjustments before you ship code.

  

---

  

With this guide you can run Broadway Copilot locally, understand how messages flow through the system, and confidently extend the conversational agent.
