import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import fetch from "node-fetch";
import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { PrismaClient } from "@prisma/client";

const storage = new Storage();

export type ImageUploadPayload = {
  userId: string;
  messageId: string;
};

export type ImageUploadResult = {
  message: string;
  successCount: number;
  errorCount: number;
};

export const imageUploadHandler = async (
  prisma: PrismaClient,
  payload: ImageUploadPayload,
): Promise<ImageUploadResult> => {
  const { userId, messageId } = payload;
  const bucketName = process.env.GCS_BUCKET_NAME;

  console.debug({ message: "Starting image upload", payload });

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME environment variable not set");
  }

  const bucket = storage.bucket(bucketName);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "uploads-"));

  try {
    const images = await prisma.media.findMany({
      where: { messageId, isUploaded: false },
    });

    if (images.length === 0) {
      console.debug({ message: "No new images to upload", payload });
      return {
        message: "No new images to upload",
        successCount: 0,
        errorCount: 0,
      };
    }

    console.debug({
      message: "Uploading images",
      count: images.length,
      payload,
    });
    let successCount = 0;
    let errorCount = 0;

    await Promise.all(
      images.map(async (image) => {
        let tempFilePath: string | undefined;

        try {
          const response = await fetch(image.serverUrl);
          if (!response.ok || !response.body) {
            throw new Error(`Failed to fetch ${image.serverUrl}`);
          }

          const extension = image.mimeType.split("/")[1] || "jpg";
          tempFilePath = path.join(tempDir, `${randomUUID()}.${extension}`);

          await pipeline(response.body, createWriteStream(tempFilePath));

          const fileName = `uploads/${userId}/${randomUUID()}.${extension}`;
          await bucket.upload(tempFilePath, {
            destination: fileName,
            metadata: { contentType: image.mimeType },
          });

          const gcsUri = `gs://${bucketName}/${fileName}`;
          await prisma.media.update({
            where: { id: image.id },
            data: { gcsUri, isUploaded: true },
          });

          successCount++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error({
            message: "Failed to upload image",
            imageId: image.id,
            error: errorMessage,
            payload,
          });
          errorCount++;
        } finally {
          if (tempFilePath) {
            await fs.unlink(tempFilePath).catch(() => {});
          }
        }
      }),
    );

    const result: ImageUploadResult = {
      message: `Upload completed`,
      successCount,
      errorCount,
    };
    console.info({ message: "Image upload finished", result, payload });
    return result;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};
