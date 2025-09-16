import "dotenv/config";
import { HttpFunction } from "@google-cloud/functions-framework";
import { PrismaClient, Task } from "@prisma/client";
import {
  imageUploadHandler,
  ImageUploadPayload,
  ImageUploadResult,
} from "./handlers/imageUpload";
import {
  storeMemoriesHandler,
  StoreMemoriesPayload,
  StoreMemoriesResult,
} from "./handlers/storeMemories";
import {
  indexWardrobeHandler,
  IndexWardrobePayload,
  IndexWardrobeResult,
} from "./handlers/indexWardrobe";

const prisma = new PrismaClient();

const validatePayload = <T extends Record<string, string>>(
  payload: unknown,
  keys: (keyof T)[],
): T => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload");
  }

  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    if (typeof obj[key as string] !== "string") {
      throw new Error(`Missing or invalid ${String(key)}`);
    }
  }

  return payload as T;
};

const withTaskLifecycle =
  <T>(
    handler: (prisma: PrismaClient, payload: T) => Promise<unknown>,
  ): HttpFunction =>
  async (req, res) => {
    const taskId = req.headers["x-cloudtasks-taskname"] as string;

    if (!taskId) {
      res.status(400).send({ message: "Missing task header" });
      return;
    }

    try {
      const task = await prisma.task.findUnique({ where: { taskId } });
      if (!task) {
        res.status(404).send({ message: "Task not found" });
        return;
      }

      await prisma.task.update({
        where: { taskId },
        data: { status: "IN_PROGRESS" },
      });

      const result = await handler(prisma, task.payload as T);

      await prisma.task.update({
        where: { taskId },
        data: { status: "COMPLETED" },
      });

      res.status(200).send(result);
    } catch (error) {
      console.error(`Task ${taskId} failed:`, error);

      await prisma.task
        .update({
          where: { taskId },
          data: { status: "FAILED" },
        })
        .catch(() => {});

      res.status(500).send({ message: "Task failed" });
    }
  };

export const imageUpload = withTaskLifecycle<ImageUploadPayload>(
  async (prisma, payload) => {
    const validated = validatePayload<ImageUploadPayload>(payload, [
      "userId",
      "messageId",
    ]);
    return imageUploadHandler(prisma, validated);
  },
);

export const storeMemories = withTaskLifecycle<StoreMemoriesPayload>(
  async (prisma, payload) => {
    const validated = validatePayload<StoreMemoriesPayload>(payload, [
      "userId",
      "conversationId",
    ]);
    return storeMemoriesHandler(prisma, validated);
  },
);

export const indexWardrobe = withTaskLifecycle<IndexWardrobePayload>(
  async (prisma, payload) => {
    const validated = validatePayload<IndexWardrobePayload>(payload, [
      "userId",
      "messageId",
    ]);
    return indexWardrobeHandler(prisma, validated);
  },
);
