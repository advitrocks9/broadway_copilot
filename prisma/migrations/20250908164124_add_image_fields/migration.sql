-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "hasImage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wardrobeProcessed" BOOLEAN NOT NULL DEFAULT false;
