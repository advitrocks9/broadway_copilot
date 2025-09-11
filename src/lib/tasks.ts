import 'dotenv/config';

import { CloudTasksClient } from "@google-cloud/tasks";
import { TaskType } from "@prisma/client";
import { createError } from "../utils/errors";
import { logger } from "../utils/logger";
import { prisma } from "./prisma";

const client = new CloudTasksClient();

const PROJECT_ID =  process.env.PROJECT_ID || "broadway-chatbot";
const CLOUD_FUNCTION_REGION = process.env.CLOUD_FUNCTION_REGION || "asia-south2";
const CLOUD_TASKS_REGION = process.env.CLOUD_TASKS_REGION || "asia-south1";

const WARDROBE_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/indexWardrobe`;
const MEMORY_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/storeMemories`;
const IMAGE_UPLOAD_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/imageUpload`;

const SERVICE_ACCOUNT_EMAIL = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;

/**
 * Queues a task to index wardrobe from a message by calling the cloud function.
 * @param messageId The ID of the message to process.
 */
export async function queueWardrobeIndex(userId: string, messageId: string): Promise<void> {
  if (!PROJECT_ID || !WARDROBE_FUNCTION_URL) {
    throw createError.internalServerError("Missing required environment variables for Cloud Tasks");
  }

  const parent = client.queuePath(PROJECT_ID, CLOUD_TASKS_REGION, "wardrobe-index");

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: WARDROBE_FUNCTION_URL,
      body: Buffer.from(JSON.stringify({})).toString("base64"),
      headers: { "Content-Type": "application/json" },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        },
      }),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name }, "Queued wardrobe index task");

    await prisma.task.create({
      data: {
        taskId: response.name!,
        userId,
        type: TaskType.SCHEDULE_WARDROBE_INDEX,
        payload: { userId, messageId },
        runAt: new Date(),
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to queue wardrobe index task");
    throw createError.internalServerError("Failed to queue task");
  }
}

/**
 * Queues a task to extract and save memories for a user by calling the cloud function.
 * @param userId The ID of the user to process.
 */
export async function queueMemoryExtraction(userId: string, conversationId: string): Promise<void> {
  if (!PROJECT_ID || !MEMORY_FUNCTION_URL) {
    throw createError.internalServerError("Missing required environment variables for Cloud Tasks");
  }

  const parent = client.queuePath(PROJECT_ID, CLOUD_TASKS_REGION, "memory-extraction");

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: MEMORY_FUNCTION_URL,
      body: Buffer.from(JSON.stringify({})).toString("base64"),
      headers: { "Content-Type": "application/json" },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        },
      }),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name }, "Queued memory extraction task");

    await prisma.task.create({
      data: {
        taskId: response.name!,
        userId,
        type: TaskType.PROCESS_MEMORIES,
        payload: { userId, conversationId },
        runAt: new Date(),
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to queue memory extraction task");
    throw createError.internalServerError("Failed to queue task");
  }
}

/**
 * Queues a task to upload images for a user by calling the cloud function.
 * @param userId The ID of the user to process.
 * @param messageId The ID of the message containing the images.
 */
export async function queueImageUpload(userId: string, messageId: string): Promise<void> {
  if (!PROJECT_ID || !IMAGE_UPLOAD_FUNCTION_URL) {
    throw createError.internalServerError("Missing required environment variables for Cloud Tasks");
  }

  const parent = client.queuePath(PROJECT_ID, CLOUD_TASKS_REGION, "image-upload");

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: IMAGE_UPLOAD_FUNCTION_URL,
      body: Buffer.from(JSON.stringify({})).toString("base64"),
      headers: { "Content-Type": "application/json" },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        },
      }),
    },
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name }, "Queued image upload task");

    await prisma.task.create({
      data: {
        taskId: response.name!,
        userId,
        type: TaskType.UPLOAD_IMAGES,
        payload: { userId, messageId },
        runAt: new Date(),
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to queue image upload task");
    throw createError.internalServerError("Failed to queue task");
  }
}