-- AlterTable
ALTER TABLE "public"."ColorAnalysis" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "palette_name" TEXT,
ADD COLUMN     "undertone" TEXT;
