import { CloudTasksClient } from "@google-cloud/tasks";
import { createError } from "../utils/errors";
import { logger } from "../utils/logger";

const client = new CloudTasksClient();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const LOCATION = process.env.CLOUD_TASKS_LOCATION ?? "us-central1";
const QUEUE_ID = process.env.CLOUD_TASKS_QUEUE ?? "broadway-tasks";

const WARDROBE_FUNCTION_URL = process.env.WARDROBE_INDEX_FUNCTION_URL ?? "";
const MEMORY_FUNCTION_URL = process.env.MEMORY_EXTRACTION_FUNCTION_URL ?? "";

const SERVICE_ACCOUNT_EMAIL = process.env.CLOUD_TASKS_SERVICE_ACCOUNT ?? "";

/**
 * Queues a task to index wardrobe from a message by calling the cloud function.
 * @param messageId The ID of the message to process.
 */
export async function queueWardrobeIndex(messageId: string, delayMs: number = 0): Promise<void> {
  if (!PROJECT_ID || !WARDROBE_FUNCTION_URL) {
    throw createError.internalServerError("Missing required environment variables for Cloud Tasks");
  }

  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_ID);

  const payload = JSON.stringify({ messageId });

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: WARDROBE_FUNCTION_URL,
      body: Buffer.from(payload).toString("base64"),
      headers: { "Content-Type": "application/json" },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        },
      }),
    },
    ...(delayMs > 0 && {
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + Math.floor(delayMs / 1000)
      }
    }),
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name }, "Queued wardrobe index task");
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to queue wardrobe index task");
    throw createError.internalServerError("Failed to queue task");
  }
}

/**
 * Queues a task to extract and save memories for a user by calling the cloud function.
 * @param userId The ID of the user to process.
 */
export async function queueMemoryExtraction(userId: string, delayMs: number = 0): Promise<void> {
  if (!PROJECT_ID || !MEMORY_FUNCTION_URL) {
    throw createError.internalServerError("Missing required environment variables for Cloud Tasks");
  }

  const parent = client.queuePath(PROJECT_ID, LOCATION, QUEUE_ID);

  const payload = JSON.stringify({ userId });

  const task = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: MEMORY_FUNCTION_URL,
      body: Buffer.from(payload).toString("base64"),
      headers: { "Content-Type": "application/json" },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
        },
      }),
    },
    ...(delayMs > 0 && {
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + Math.floor(delayMs / 1000)
      }
    }),
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name }, "Queued memory extraction task");
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to queue memory extraction task");
    throw createError.internalServerError("Failed to queue task");
  }
}