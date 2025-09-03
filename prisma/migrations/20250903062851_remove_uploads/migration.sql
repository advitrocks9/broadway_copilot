/*
  Warnings:

  - You are about to drop the column `uploadId` on the `ColorAnalysis` table. All the data in the column will be lost.
  - The `content` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `uploadId` on the `ModelTrace` table. All the data in the column will be lost.
  - You are about to drop the column `uploadId` on the `VibeCheck` table. All the data in the column will be lost.
  - You are about to drop the `Upload` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_MessageUploads` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[messageId]` on the table `ColorAnalysis` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[fileId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[messageId]` on the table `VibeCheck` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `messageId` to the `ColorAnalysis` table without a default value. This is not possible if the table is not empty.
  - Added the required column `messageId` to the `VibeCheck` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."ColorAnalysis" DROP CONSTRAINT "ColorAnalysis_uploadId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ModelTrace" DROP CONSTRAINT "ModelTrace_uploadId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Upload" DROP CONSTRAINT "Upload_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VibeCheck" DROP CONSTRAINT "VibeCheck_uploadId_fkey";

-- DropForeignKey
ALTER TABLE "public"."_MessageUploads" DROP CONSTRAINT "_MessageUploads_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_MessageUploads" DROP CONSTRAINT "_MessageUploads_B_fkey";

-- DropIndex
DROP INDEX "public"."ColorAnalysis_uploadId_key";

-- DropIndex
DROP INDEX "public"."VibeCheck_uploadId_key";

-- AlterTable
ALTER TABLE "public"."ColorAnalysis" DROP COLUMN "uploadId",
ADD COLUMN     "messageId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "filename" TEXT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "width" INTEGER,
DROP COLUMN "content",
ADD COLUMN     "content" JSONB;

-- AlterTable
ALTER TABLE "public"."ModelTrace" DROP COLUMN "uploadId";

-- AlterTable
ALTER TABLE "public"."VibeCheck" DROP COLUMN "uploadId",
ADD COLUMN     "messageId" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."Upload";

-- DropTable
DROP TABLE "public"."_MessageUploads";

-- CreateIndex
CREATE UNIQUE INDEX "ColorAnalysis_messageId_key" ON "public"."ColorAnalysis"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_fileId_key" ON "public"."Message"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "VibeCheck_messageId_key" ON "public"."VibeCheck"("messageId");

-- AddForeignKey
ALTER TABLE "public"."VibeCheck" ADD CONSTRAINT "VibeCheck_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ColorAnalysis" ADD CONSTRAINT "ColorAnalysis_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
