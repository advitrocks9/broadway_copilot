-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "buttonPayload" TEXT,
ADD COLUMN     "buttonText" TEXT,
ADD COLUMN     "messageType" TEXT;

-- CreateIndex
CREATE INDEX "Message_buttonPayload_idx" ON "public"."Message"("buttonPayload");
