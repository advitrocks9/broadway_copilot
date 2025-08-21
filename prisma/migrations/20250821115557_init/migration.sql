-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inferredGender" TEXT,
    "confirmedGender" TEXT,
    "lastVibeCheckAt" TIMESTAMP(3),
    "lastColorAnalysisAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Turn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT,
    "imagePath" TEXT,
    "fileId" TEXT,
    "intent" TEXT,
    "choices" JSONB,
    "metadata" JSONB,
    "replies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "fileId" TEXT,
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
    "comment" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,

    CONSTRAINT "VibeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ColorAnalysis" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "skin_tone" TEXT,
    "eye_color" TEXT,
    "hair_color" TEXT,
    "top3_colors" JSONB NOT NULL,
    "avoid3_colors" JSONB NOT NULL,
    "rawJson" JSONB NOT NULL,

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
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModelTrace" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT,
    "kind" TEXT NOT NULL,
    "rawRequest" JSONB NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_waId_key" ON "public"."User"("waId");

-- CreateIndex
CREATE INDEX "Turn_userId_createdAt_idx" ON "public"."Turn"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VibeCheck_uploadId_key" ON "public"."VibeCheck"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "ColorAnalysis_uploadId_key" ON "public"."ColorAnalysis"("uploadId");

-- CreateIndex
CREATE INDEX "WardrobeItem_userId_nameLower_category_idx" ON "public"."WardrobeItem"("userId", "nameLower", "category");

-- AddForeignKey
ALTER TABLE "public"."Turn" ADD CONSTRAINT "Turn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VibeCheck" ADD CONSTRAINT "VibeCheck_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "public"."Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WardrobeItem" ADD CONSTRAINT "WardrobeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
