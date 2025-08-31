-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH VERSION "0.8.0";

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'AI', 'SYSTEM', 'TOOL');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inferredGender" TEXT,
    "inferredAgeGroup" TEXT,
    "confirmedGender" TEXT,
    "confirmedAgeGroup" TEXT,
    "lastVibeCheckAt" TIMESTAMP(3),
    "lastColorAnalysisAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" TEXT,
    "additionalKwargs" JSONB,
    "intent" TEXT,
    "embedding" vector,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "embeddingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "imagePath" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VibeCheck" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
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
    "uploadId" TEXT NOT NULL,
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
    "uploadId" TEXT,
    "model" TEXT,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_MessageUploads" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MessageUploads_AB_pkey" PRIMARY KEY ("A","B")
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
CREATE UNIQUE INDEX "Upload_fileId_key" ON "public"."Upload"("fileId");

-- CreateIndex
CREATE INDEX "Upload_userId_createdAt_idx" ON "public"."Upload"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VibeCheck_uploadId_key" ON "public"."VibeCheck"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "ColorAnalysis_uploadId_key" ON "public"."ColorAnalysis"("uploadId");

-- CreateIndex
CREATE INDEX "WardrobeItem_userId_nameLower_category_idx" ON "public"."WardrobeItem"("userId", "nameLower", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_messageId_key" ON "public"."Feedback"("messageId");

-- CreateIndex
CREATE INDEX "ModelTrace_userId_createdAt_idx" ON "public"."ModelTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelTrace_messageId_idx" ON "public"."ModelTrace"("messageId");

-- CreateIndex
CREATE INDEX "_MessageUploads_B_index" ON "public"."_MessageUploads"("B");

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VibeCheck" ADD CONSTRAINT "VibeCheck_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WardrobeItem" ADD CONSTRAINT "WardrobeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModelTrace" ADD CONSTRAINT "ModelTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModelTrace" ADD CONSTRAINT "ModelTrace_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModelTrace" ADD CONSTRAINT "ModelTrace_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MessageUploads" ADD CONSTRAINT "_MessageUploads_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_MessageUploads" ADD CONSTRAINT "_MessageUploads_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
