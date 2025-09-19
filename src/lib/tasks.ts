import 'dotenv/config';

import { CloudTasksClient } from '@google-cloud/tasks';
import { createId as cuid } from '@paralleldrive/cuid2';
import { TaskType } from '@prisma/client';
import { InternalServerError } from '../utils/errors';
import { logger } from '../utils/logger';
import { prisma } from './prisma';

type TaskPayload = {
  userId: string;
  [key: string]: string;
};

const client = new CloudTasksClient();

const PROJECT_ID = process.env.PROJECT_ID || 'broadway-chatbot';
const CLOUD_FUNCTION_REGION = process.env.CLOUD_FUNCTION_REGION || 'asia-south2';
const CLOUD_TASKS_REGION = process.env.CLOUD_TASKS_REGION || 'asia-south1';

const WARDROBE_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/indexWardrobe`;
const MEMORY_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/storeMemories`;
const IMAGE_UPLOAD_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/imageUpload`;

const SERVICE_ACCOUNT_EMAIL = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;

/**
 * A generic task queuing function.
 * @param queueName The name of the Cloud Tasks queue.
 * @param functionUrl The URL of the Cloud Function to invoke.
 * @param payload The payload to send to the Cloud Function.
 * @param taskType The type of the task to record in the database.
 */
async function queueTask(
  queueName: string,
  functionUrl: string,
  payload: TaskPayload,
  taskType: TaskType,
): Promise<void> {
  if (!PROJECT_ID || !functionUrl) {
    throw new InternalServerError('Missing required environment variables for Cloud Tasks');
  }

  const parent = client.queuePath(PROJECT_ID, CLOUD_TASKS_REGION, queueName);
  const taskId = cuid();
  const taskName = `${parent}/tasks/${taskId}`;

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: functionUrl,
      body: Buffer.from(JSON.stringify(payload)),
      headers: { 'Content-Type': 'application/json' },
      ...(SERVICE_ACCOUNT_EMAIL && {
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          audience: functionUrl,
        },
      }),
    },
    name: taskName,
  };

  try {
    const [response] = await client.createTask({ parent, task });
    logger.info({ taskName: response.name, type: taskType }, `Queued ${taskType} task`);

    await prisma.task.create({
      data: {
        taskId: taskId,
        userId: payload.userId,
        type: taskType,
        payload,
        runAt: new Date(),
      },
    });
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), type: taskType },
      `Failed to queue ${taskType} task`,
    );
    throw new InternalServerError('Failed to queue task');
  }
}

/**
 * Queues a task to index wardrobe from a message by calling the cloud function.
 * @param messageId The ID of the message to process.
 */
export async function queueWardrobeIndex(userId: string, messageId: string): Promise<void> {
  await queueTask(
    'wardrobe-index',
    WARDROBE_FUNCTION_URL,
    { userId, messageId },
    TaskType.SCHEDULE_WARDROBE_INDEX,
  );
}

/**
 * Queues a task to extract and save memories for a user by calling the cloud function.
 * @param userId The ID of the user to process.
 */
export async function queueMemoryExtraction(userId: string, conversationId: string): Promise<void> {
  await queueTask(
    'memory-extraction',
    MEMORY_FUNCTION_URL,
    { userId, conversationId },
    TaskType.PROCESS_MEMORIES,
  );
}

/**
 * Queues a task to upload images for a user by calling the cloud function.
 * @param userId The ID of the user to process.
 * @param messageId The ID of the message containing the images.
 */
export async function queueImageUpload(userId: string, messageId: string): Promise<void> {
  await queueTask(
    'image-upload',
    IMAGE_UPLOAD_FUNCTION_URL,
    { userId, messageId },
    TaskType.UPLOAD_IMAGES,
  );
}
