-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH VERSION "0.8.0";

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'AI', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "public"."Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "public"."AgeGroup" AS ENUM ('AGE_13_17', 'AGE_18_25', 'AGE_26_35', 'AGE_36_45', 'AGE_46_55', 'AGE_55_PLUS');

-- CreateEnum
CREATE TYPE "public"."MemoryCategory" AS ENUM ('PROFILE', 'PREFERENCE', 'STYLE', 'COLOR', 'SIZE', 'OCCASION', 'BRAND', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PendingType" AS ENUM ('NONE', 'VIBE_CHECK_IMAGE', 'COLOR_ANALYSIS_IMAGE', 'ASK_USER_INFO');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inferredGender" "public"."Gender",
    "inferredAgeGroup" "public"."AgeGroup",
    "confirmedGender" "public"."Gender",
    "confirmedAgeGroup" "public"."AgeGroup",
    "lastVibeCheckAt" TIMESTAMP(3),
    "lastColorAnalysisAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "additionalKwargs" JSONB,
    "intent" TEXT,
    "buttonPayload" TEXT,
    "pending" "public"."PendingType" DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memoriesProcessed" BOOLEAN NOT NULL DEFAULT false,
    "wardrobeProcessed" BOOLEAN NOT NULL DEFAULT false,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "imageArchived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "public"."MemoryCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "sourceMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

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
    "colors" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "description" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddingAt" TIMESTAMP(3),

    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "helpful" BOOLEAN,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModelTrace" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "messageId" TEXT,
    "model" TEXT,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_waId_key" ON "public"."User"("waId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "public"."Message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_role_createdAt_idx" ON "public"."Message"("role", "createdAt");

-- CreateIndex
CREATE INDEX "Message_buttonPayload_idx" ON "public"."Message"("buttonPayload");

-- CreateIndex
CREATE INDEX "Memory_userId_updatedAt_idx" ON "public"."Memory"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_userId_category_key_key" ON "public"."Memory"("userId", "category", "key");

-- CreateIndex
CREATE INDEX "VibeCheck_userId_createdAt_idx" ON "public"."VibeCheck"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ColorAnalysis_userId_createdAt_idx" ON "public"."ColorAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WardrobeItem_userId_nameLower_category_idx" ON "public"."WardrobeItem"("userId", "nameLower", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_messageId_key" ON "public"."Feedback"("messageId");

-- CreateIndex
CREATE INDEX "ModelTrace_userId_createdAt_idx" ON "public"."ModelTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelTrace_messageId_idx" ON "public"."ModelTrace"("messageId");

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VibeCheck" ADD CONSTRAINT "VibeCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WardrobeItem" ADD CONSTRAINT "WardrobeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModelTrace" ADD CONSTRAINT "ModelTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModelTrace" ADD CONSTRAINT "ModelTrace_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
