-- CreateEnum
CREATE TYPE "public"."MemoryCategory" AS ENUM ('PROFILE', 'PREFERENCE', 'STYLE', 'COLOR', 'SIZE', 'OCCASION', 'BRAND', 'OTHER');

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "memoriesProcessed" BOOLEAN NOT NULL DEFAULT false;

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

-- CreateIndex
CREATE INDEX "Memory_userId_updatedAt_idx" ON "public"."Memory"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Memory_userId_category_key_key" ON "public"."Memory"("userId", "category", "key");

-- AddForeignKey
ALTER TABLE "public"."Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
