## Broadway Copilot

Broadway Copilot is a WhatsApp personal stylist powered by LangGraph and OpenAI. It understands user intent, analyzes outfit photos, and returns responses via Twilio WhatsApp.

### Architecture

- **Express API**: Receives Twilio webhooks at `POST /twilio/` and `POST /twilio/callback/`, serves static files under `/uploads/`
- **LangGraph Agent**: State machine with 17+ nodes that intelligently routes conversations through specialized handlers:
  - **Core Flow**: `ingest_message` → `hydrate_context` → `infer_profile` → `route_intent`
  - **Intent Handlers**: `handle_occasion`, `handle_vacation`, `handle_pairing`, `handle_suggest`, `handle_general`
  - **Image Processing**: `check_image` → `vibe_check` or `color_analysis`
  - **Utilities**: `ask_user_info`, `wardrobe_index`, `hydrate_context`, `send_reply`
- **Services**:
  - **orchestrator**: Manages inbound message processing with rate limiting and queue management
  - **runtimeState**: Tracks processing state, queues, and abort controllers per user
  - **twilioService**: WhatsApp messaging with support for text, menu, and card templates
  - **openaiService**: Standardized OpenAI Chat and Vision API clients
  - **media**: Image download and upload helpers for OpenAI Vision
- **Database**: Prisma + PostgreSQL with models for users, conversation turns, uploads, AI analysis results, wardrobe items, and model traces

### Database Schema

The application uses PostgreSQL with Prisma ORM. Key models include:

- **User**: Stores WhatsApp user info, inferred/confirmed gender, and activity timestamps
- **Turn**: Conversation turns with role (user/assistant), text, images, intent classification, and metadata
- **Upload**: Image uploads with file paths and OpenAI file IDs
- **VibeCheck**: AI outfit analysis with scores for fit, color harmony, styling details, accessories, context confidence, and overall rating
- **ColorAnalysis**: Seasonal color analysis with skin tone, eye/hair color, undertone, palette recommendations, and color suggestions
- **WardrobeItem**: User's clothing catalog with categories, colors, types, subtypes, and attributes
- **ModelTrace**: Debug logging for OpenAI API requests and responses

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

## Dependencies

**Core Dependencies:**
- `@langchain/core@^0.3.72`, `@langchain/langgraph@^0.4.5`, `@langchain/openai@^0.6.9` - LangGraph agent framework and OpenAI integration
- `@prisma/client@^6.14.0`, `prisma@^6.14.0` - Database ORM and migrations
- `express@^5.1.0` - Web server framework
- `twilio@^5.8.0` - WhatsApp messaging service
- `openai@^5.12.2` - OpenAI API client
- `zod@^3.25.76` - Schema validation
- `multer@^2.0.2` - File upload handling
- `cors@^2.8.5` - Cross-origin resource sharing
- `dotenv@^17.2.1` - Environment variable management
- `pino@^9.9.0` - Structured logging

**Development Dependencies:**
- `@types/*` - TypeScript type definitions
- `ts-node-dev@^2.0.0` - Development server with hot reload
- `typescript@^5.9.2` - TypeScript compiler
- `pino-pretty@^13.1.1` - Pretty-printing for logs

## Environment variables

Create a `.env` at the repo root:

```
# OpenAI (Required)
OPENAI_API_KEY=

# Twilio (Required)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Twilio Content Templates (Optional - fallbacks to text if absent)
TWILIO_MENU_SID=
TWILIO_CARD_SID=

# Twilio Configuration (Optional)
TWILIO_VALIDATE_WEBHOOK=true
TWILIO_STATUS_CALLBACK_URL=
TWILIO_HTTP_TIMEOUT_MS=10000
TWILIO_WAIT_FOR_STATUS=true
TWILIO_SENT_TIMEOUT_MS=15000
TWILIO_DELIVERED_TIMEOUT_MS=60000

# Database (Required)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public

# Server Configuration (Optional)
PORT=8080
LOG_LEVEL=debug
NODE_ENV=development
```

Notes:
- `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `DATABASE_URL` are required
- If `TWILIO_VALIDATE_WEBHOOK=false`, signature checks are skipped (helpful for local testing)
- `TWILIO_MENU_SID` and `TWILIO_CARD_SID` are optional; without them, replies fall back to plain text
- `TWILIO_STATUS_CALLBACK_URL` should point to your `/twilio/callback/` endpoint for delivery confirmations
- Timeout values control how long the system waits for message status updates

## Install and initialize

```bash
npm install
npx prisma generate
```

## Available Scripts

- `npm run dev` - Start development server with hot reload using ts-node-dev
- `npm run build` - Compile TypeScript to JavaScript in `dist/` directory
- `npm start` - Start production server (requires build first)
- `npm run graph` - Generate and update the LangGraph visualization (`langgraph.png`)

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

- `POST /twilio/`: Main Twilio WhatsApp webhook endpoint for inbound messages. Validates `X-Twilio-Signature` header by default (configurable via `TWILIO_VALIDATE_WEBHOOK`). Processes messages through the LangGraph agent and handles rate limiting.
- `POST /twilio/callback/`: Twilio status callback endpoint for message delivery confirmations and errors.
- `GET /uploads/...`: Serves static uploaded images and media files from the `uploads/` directory.

## Docker

The application uses a multi-stage Docker build for optimized production images.

**Build locally:**

```bash
docker build -t broadway-copilot .
```

**Run locally:**

```bash
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID \
  -e TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN \
  -e DATABASE_URL=$DATABASE_URL \
  --name broadway-copilot broadway-copilot
```

**Dockerfile features:**
- Multi-stage build: `build` stage compiles TypeScript, `production` stage runs the application
- Pre-configured environment variables for production (can be overridden)
- Includes default Twilio template SIDs and WhatsApp number
- Copies compiled JavaScript, prompts, and Prisma schema
- Generates Prisma client at runtime for database connectivity
- Runs on port 8080 with production optimizations

## Deploy to Google Cloud Run

This repo includes a GitHub Actions workflow (`.github/workflows/google-cloudrun-docker.yml`) for automated deployment to Cloud Run.

**Deployment triggers:**
- Automatic deployment on push to `main` branch
- Manual deployment via `workflow_dispatch`

**Deployment process:**
1. Authenticates with Google Cloud using Workload Identity
2. Builds Docker container and pushes to Artifact Registry (`asia-south2` region)
3. Deploys to Cloud Run service `broadway-chatbot`
4. Configures environment secrets for production

**Required GitHub Actions repository secrets:**
- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `DATABASE_URL`

**Prerequisites:**
- Google Cloud Project with Artifact Registry enabled
- Workload Identity Federation configured
- Cloud Run API enabled
- Appropriate IAM permissions for the service account

**Service configuration:**
- Region: `asia-south2`
- Service Account: `github-actions-deploy@broadway-chatbot.iam.gserviceaccount.com`
- Secrets are injected as environment variables at deployment time

## Key files

**API & Server:**
- `src/api/index.ts`: Express server with Twilio webhook handlers (`/twilio/`, `/twilio/callback/`)
- `src/api/middleware/errors.ts`: Error handling middleware

**LangGraph Agent:**
- `src/agent/graph.ts`: LangGraph state machine definition and execution engine
- `src/agent/state.ts`: TypeScript types for agent state and annotations
- `src/agent/nodes/`: 17+ specialized node handlers:
  - `routeIntent.ts`: Intent classification engine
  - `ingestMessage.ts`: Message preprocessing and validation
  - `hydrateContext.ts`: Context loading from database
  - `inferProfile.ts`: User profile inference
  - `checkImage.ts`: Image analysis routing
  - `vibeCheck.ts`, `colorAnalysis.ts`: AI-powered outfit and color analysis
  - `handle*.ts`: Domain-specific conversation handlers (occasion, vacation, pairing, suggest, general)
  - `askUserInfo.ts`: Profile information collection
  - `wardrobeIndex.ts`: Wardrobe management
  - `sendReply.ts`: Response formatting and delivery

**Services:**
- `src/services/orchestrator.ts`: Inbound message processing with rate limiting and queue management
- `src/services/runtimeState.ts`: Per-user state tracking and processing coordination
- `src/services/twilioService.ts`: WhatsApp messaging with template support
- `src/services/openaiService.ts`: Standardized OpenAI API clients for chat and vision

**Database & Types:**
- `prisma/schema.prisma`: Database models and relationships
- `src/db/client.ts`: Prisma client configuration
- `src/types/`: TypeScript type definitions:
  - `common.ts`: Shared types and interfaces
  - `contracts.ts`: Agent communication contracts
  - `twilio.ts`: Twilio webhook and API types

**Utilities:**
- `src/utils/media.ts`: Image download/upload and OpenAI Vision helpers
- `src/utils/twilioHelpers.ts`: Webhook validation and message processing
- `src/utils/logger.ts`: Structured logging with Pino
- `src/utils/validation.ts`: Input validation utilities
- `src/utils/text.ts`: Text processing helpers
- `src/utils/user.ts`: User management utilities
- `src/utils/paths.ts`: Path resolution helpers
- `src/utils/prompts.ts`: Prompt loading and management
- `src/utils/constants.ts`: Application constants
- `src/utils/context.ts`: Context management utilities
- `src/utils/errors.ts`: Error handling utilities
- `src/utils/handlerUtils.ts`: Shared handler utilities

**Configuration & Scripts:**
- `package.json`: Dependencies and build scripts
- `tsconfig.json`: TypeScript compiler configuration
- `Dockerfile`: Multi-stage Docker build for production
- `scripts/visualizeGraph.ts`: LangGraph visualization generator
- `prompts/`: AI model prompts for different conversation intents

## Agent Capabilities

Broadway Copilot is a sophisticated WhatsApp-based personal stylist powered by LangGraph and OpenAI. It intelligently routes conversations through specialized AI handlers to provide personalized fashion and beauty advice.

**Core Features:**

**Fashion & Style Analysis:**
- **Outfit Rating (Vibe Check)**: Upload outfit photos for AI-powered analysis with detailed scores for fit, color harmony, styling details, accessories, and overall aesthetic
- **Color Analysis**: Seasonal color analysis from face photos or color palettes, providing personalized color recommendations, undertone identification, and makeup/hair suggestions
- **Style Suggestions**: Get outfit improvement recommendations, style tweaks, and shopping suggestions based on your current looks

**Personalized Recommendations:**
- **Occasion Styling**: Event-appropriate outfit advice considering dress code, weather, climate, and occasion tone
- **Vacation Packing**: Destination-aware outfit and packing recommendations with weather/activity context and capsule wardrobe suggestions
- **Item Pairing**: Style specific clothing items with complementary color, silhouette, fabric, and accessory recommendations

**Wardrobe Management:**
- **Digital Wardrobe**: Catalog and organize your clothing collection
- **Outfit Coordination**: AI-powered outfit suggestions based on your existing wardrobe
- **Style History**: Track your fashion journey and preferences over time

**Smart Conversation Flow:**
- **Intent Recognition**: Automatically understands user requests and routes to appropriate specialized handlers
- **Context Awareness**: Maintains conversation context across multiple turns
- **Profile Inference**: Learns user preferences including gender, style preferences, and fashion profile
- **Multi-modal Input**: Processes both text messages and image uploads

**Response Formats:**
- **Rich Messaging**: Supports WhatsApp templates including menus, cards, and formatted text
- **Interactive Conversations**: Guides users through style decisions with contextual follow-ups
- **Personalized Communication**: Adapts tone and style recommendations based on user profile and preferences

The agent uses advanced natural language processing to understand fashion-related queries and provides actionable, personalized style advice through an intuitive WhatsApp interface.

## Troubleshooting

**Twilio Integration:**
- **401 Unauthorized**: Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct
- **Signature validation failures**: Check webhook URL configuration or set `TWILIO_VALIDATE_WEBHOOK=false` for local testing
- **Message delivery issues**: Ensure `TWILIO_STATUS_CALLBACK_URL` points to your `/twilio/callback/` endpoint
- **Template errors**: Verify `TWILIO_MENU_SID` and `TWILIO_CARD_SID` are valid (optional - system falls back to text)

**OpenAI Integration:**
- **API errors**: Ensure `OPENAI_API_KEY` is set and has sufficient credits
- **File upload failures**: Check network connectivity and OpenAI service status
- **Vision analysis timeouts**: Large images may timeout; try smaller file sizes

**Database:**
- **Connection errors**: Verify `DATABASE_URL` format and database availability
- **Migration issues**: Run `npx prisma migrate deploy` in production or `npx prisma migrate dev` in development
- **Prisma client errors**: Run `npx prisma generate` after dependency installation

**Application:**
- **Build failures**: Ensure TypeScript compilation succeeds with `npm run build`
- **Port conflicts**: Default port 8080 may be in use; configure `PORT` environment variable
- **Rate limiting**: System includes built-in rate limiting; excessive messages may be queued
- **Memory issues**: Monitor container resources, especially during image processing

**Development:**
- **Hot reload not working**: Ensure `ts-node-dev` is properly installed and configured
- **Graph visualization**: Run `npm run graph` to update `langgraph.png` after agent changes
- **Environment variables**: Use `.env` file for local development; ensure all required variables are set

**Deployment:**
- **Cloud Run build failures**: Check build logs for missing dependencies or compilation errors
- **Secret injection issues**: Verify GitHub Actions secrets are properly configured
- **Database connectivity**: Ensure Cloud Run service has proper VPC/networking for database access
