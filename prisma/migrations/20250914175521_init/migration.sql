-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH VERSION "0.8.0";

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'AI', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "public"."AgeGroup" AS ENUM ('AGE_13_17', 'AGE_18_25', 'AGE_26_35', 'AGE_36_45', 'AGE_46_55', 'AGE_55_PLUS');

-- CreateEnum
CREATE TYPE "public"."PendingType" AS ENUM ('NONE', 'VIBE_CHECK_IMAGE', 'COLOR_ANALYSIS_IMAGE', 'ASK_USER_INFO', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "public"."TaskType" AS ENUM ('SEND_FEEDBACK_REQUEST', 'SCHEDULE_WARDROBE_INDEX', 'PROCESS_MEMORIES', 'UPLOAD_IMAGES');

-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."GraphRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ERROR', 'ABORTED');

-- CreateEnum
CREATE TYPE "public"."ConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "whatsappId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL DEFAULT '',
    "inferredGender" "public"."Gender",
    "inferredAgeGroup" "public"."AgeGroup",
    "confirmedGender" "public"."Gender",
    "confirmedAgeGroup" "public"."AgeGroup",
    "lastVibeCheckAt" TIMESTAMP(3),
    "lastColorAnalysisAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "intent" TEXT,
    "buttonPayload" TEXT,
    "pending" "public"."PendingType" DEFAULT 'NONE',
    "content" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "additionalKwargs" JSONB,
    "memoriesProcessed" BOOLEAN NOT NULL DEFAULT false,
    "wardrobeProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Media" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "twilioUrl" TEXT NOT NULL,
    "serverUrl" TEXT NOT NULL,
    "gcsUri" TEXT,
    "mimeType" TEXT NOT NULL,
    "isUploaded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memory" TEXT NOT NULL,
    "embedding" vector,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VibeCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fit_silhouette" DOUBLE PRECISION,
    "color_harmony" DOUBLE PRECISION,
    "styling_details" DOUBLE PRECISION,
    "accessories_texture" DOUBLE PRECISION,
    "context_confidence" DOUBLE PRECISION,
    "overall_score" DOUBLE PRECISION,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VibeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ColorAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skin_tone" TEXT,
    "eye_color" TEXT,
    "hair_color" TEXT,
    "undertone" TEXT,
    "palette_name" TEXT,
    "top3_colors" JSONB,
    "avoid3_colors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColorAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WardrobeItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLower" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "description" TEXT,
    "colors" JSONB NOT NULL,
    "attributes" JSONB,
    "embedding" vector,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GraphRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "public"."GraphRunStatus" NOT NULL DEFAULT 'RUNNING',
    "errorTrace" TEXT,
    "initialState" JSONB NOT NULL,
    "finalState" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "GraphRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LLMTrace" (
    "id" TEXT NOT NULL,
    "graphRunId" TEXT NOT NULL,
    "nodeName" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "errorTrace" TEXT,
    "inputMessages" JSONB NOT NULL,
    "outputMessage" JSONB,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "LLMTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."TaskType" NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,

    CONSTRAINT "Admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminWhitelist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "AdminWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserWhitelist" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,

    CONSTRAINT "UserWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappId_key" ON "public"."User"("whatsappId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_userId_createdAt_idx" ON "public"."Conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_status_createdAt_idx" ON "public"."Conversation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "public"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_role_createdAt_idx" ON "public"."Message"("role", "createdAt");

-- CreateIndex
CREATE INDEX "Message_buttonPayload_idx" ON "public"."Message"("buttonPayload");

-- CreateIndex
CREATE INDEX "Media_messageId_idx" ON "public"."Media"("messageId");

-- CreateIndex
CREATE INDEX "Memory_userId_createdAt_idx" ON "public"."Memory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "VibeCheck_userId_createdAt_idx" ON "public"."VibeCheck"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ColorAnalysis_userId_createdAt_idx" ON "public"."ColorAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WardrobeItem_userId_nameLower_category_idx" ON "public"."WardrobeItem"("userId", "nameLower", "category");

-- CreateIndex
CREATE INDEX "GraphRun_conversationId_startTime_idx" ON "public"."GraphRun"("conversationId", "startTime");

-- CreateIndex
CREATE INDEX "GraphRun_userId_startTime_idx" ON "public"."GraphRun"("userId", "startTime");

-- CreateIndex
CREATE INDEX "LLMTrace_graphRunId_idx" ON "public"."LLMTrace"("graphRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_conversationId_key" ON "public"."Feedback"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_taskId_key" ON "public"."Task"("taskId");

-- CreateIndex
CREATE INDEX "Task_userId_runAt_idx" ON "public"."Task"("userId", "runAt");

-- CreateIndex
CREATE INDEX "Task_status_runAt_idx" ON "public"."Task"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Admins_email_key" ON "public"."Admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminWhitelist_email_key" ON "public"."AdminWhitelist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserWhitelist_waId_key" ON "public"."UserWhitelist"("waId");

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Media" ADD CONSTRAINT "Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VibeCheck" ADD CONSTRAINT "VibeCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WardrobeItem" ADD CONSTRAINT "WardrobeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GraphRun" ADD CONSTRAINT "GraphRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GraphRun" ADD CONSTRAINT "GraphRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LLMTrace" ADD CONSTRAINT "LLMTrace_graphRunId_fkey" FOREIGN KEY ("graphRunId") REFERENCES "public"."GraphRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
