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
      console.error({ message: "Missing task header" });
      res.status(400).send({ message: "Missing task header" });
      return;
    }
    console.info({ message: "Received task request", taskId });

    try {
      const task = await prisma.task.findUnique({ where: { taskId } });
      if (!task) {
        console.error({ message: "Task not found", taskId });
        res.status(404).send({ message: "Task not found" });
        return;
      }

      if (task.status === "COMPLETED") {
        console.warn({ message: "Task already completed", taskId });
        res.status(200).send({ message: "Task already completed" });
        return;
      }

      if (task.status === "IN_PROGRESS") {
        console.warn({ message: "Task already in progress", taskId });
        res.status(409).send({ message: "Task already in progress" });
        return;
      }

      if (task.status !== "QUEUED") {
        console.error({
          message: "Task in invalid state",
          taskId,
          status: task.status,
        });
        res
          .status(400)
          .send({ message: `Task in invalid state: ${task.status}` });
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error({
        message: "Task failed",
        taskId,
        error: errorMessage,
      });

      await prisma.task
        .update({
          where: { taskId },
          data: { status: "FAILED" },
        })
        .catch(() => {});

      res.status(500).send({ message: "Task failed" });
    }
  };

const imageUploadFunction = withTaskLifecycle<ImageUploadPayload>(
  async (prisma, payload) => {
    const validated = validatePayload<ImageUploadPayload>(payload, [
      "userId",
      "messageId",
    ]);
    return imageUploadHandler(prisma, validated);
  },
);

const storeMemoriesFunction = withTaskLifecycle<StoreMemoriesPayload>(
  async (prisma, payload) => {
    const validated = validatePayload<StoreMemoriesPayload>(payload, [
      "userId",
      "conversationId",
    ]);
    return storeMemoriesHandler(prisma, validated);
  },
);

const indexWardrobeFunction = withTaskLifecycle<IndexWardrobePayload>(
  async (prisma, payload) => {
    const validated = validatePayload<IndexWardrobePayload>(payload, [
      "userId",
      "messageId",
    ]);
    return indexWardrobeHandler(prisma, validated);
  },
);

export const imageUpload: HttpFunction = imageUploadFunction;
export const storeMemories: HttpFunction = storeMemoriesFunction;
export const indexWardrobe: HttpFunction = indexWardrobeFunction;