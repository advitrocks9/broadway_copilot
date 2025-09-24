/**
 * @module tasks
 * @description Cloud Tasks integration for queueing background work to Google Cloud Functions.
 * Handles wardrobe indexing, memory extraction, image upload, and feedback request tasks.
 * In development mode, tasks short-circuit and run inline instead of being queued.
 */

import 'dotenv/config';

import { CloudTasksClient, type protos } from '@google-cloud/tasks';
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
const FEEDBACK_FUNCTION_URL = `https://${CLOUD_FUNCTION_REGION}-${PROJECT_ID}.cloudfunctions.net/sendFeedbackRequest`;

const SERVICE_ACCOUNT_EMAIL = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;

async function queueTask(
  queueName: string,
  functionUrl: string,
  payload: TaskPayload,
  taskType: TaskType,
  options: { scheduleTime?: Date } = {},
): Promise<void> {
  if (!PROJECT_ID || !functionUrl) {
    throw new InternalServerError('Missing required environment variables for Cloud Tasks');
  }

  const parent = client.queuePath(PROJECT_ID, CLOUD_TASKS_REGION, queueName);
  const taskId = cuid();
  const taskName = `${parent}/tasks/${taskId}`;

  const task: protos.google.cloud.tasks.v2.ITask = {
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

  if (options.scheduleTime) {
    const milliseconds = options.scheduleTime.getTime();
    task.scheduleTime = {
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1_000_000,
    };
  }

  const [response] = await client.createTask({ parent, task });
  logger.info({ taskName: response.name, type: taskType }, `Queued ${taskType} task`);

  const runAt = options.scheduleTime ?? new Date();

  await prisma.task.create({
    data: {
      taskId: taskId,
      userId: payload.userId,
      type: taskType,
      payload,
      runAt,
    },
  });
}

function runTaskInBackground(taskType: TaskType, runner: () => Promise<void>): void {
  setImmediate(() => {
    runner().catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), type: taskType },
        `Failed to queue ${taskType} task`,
      );
    });
  });
}

export function queueWardrobeIndex(userId: string, messageId: string): void {
  if (process.env.NODE_ENV === 'development') {
    logger.debug({ userId, messageId }, 'Skipping wardrobe index queueing in development');
    return;
  }

  runTaskInBackground(TaskType.SCHEDULE_WARDROBE_INDEX, () =>
    queueTask(
      'wardrobe-index',
      WARDROBE_FUNCTION_URL,
      { userId, messageId },
      TaskType.SCHEDULE_WARDROBE_INDEX,
    ),
  );
}

export function queueMemoryExtraction(userId: string, conversationId: string): void {
  if (process.env.NODE_ENV === 'development') {
    logger.debug({ userId, conversationId }, 'Skipping memory extraction queueing in development');
    return;
  }

  runTaskInBackground(TaskType.PROCESS_MEMORIES, () =>
    queueTask(
      'memory-extraction',
      MEMORY_FUNCTION_URL,
      { userId, conversationId },
      TaskType.PROCESS_MEMORIES,
    ),
  );
}

export function queueImageUpload(userId: string, messageId: string): void {
  if (process.env.NODE_ENV === 'development') {
    logger.debug({ userId, messageId }, 'Skipping image upload queueing in development');
    return;
  }

  runTaskInBackground(TaskType.UPLOAD_IMAGES, () =>
    queueTask(
      'image-upload',
      IMAGE_UPLOAD_FUNCTION_URL,
      { userId, messageId },
      TaskType.UPLOAD_IMAGES,
    ),
  );
}

export function queueFeedbackRequest(userId: string, conversationId: string): void {
  if (process.env.NODE_ENV === 'development') {
    logger.debug({ userId, conversationId }, 'Skipping feedback request queueing in development');
    return;
  }

  const delayMs = Number(process.env.FEEDBACK_REQUEST_DELAY_MS || 60_000);
  const scheduleTime = new Date(Date.now() + delayMs);

  runTaskInBackground(TaskType.SEND_FEEDBACK_REQUEST, () =>
    queueTask(
      'feedback-request',
      FEEDBACK_FUNCTION_URL,
      { userId, conversationId },
      TaskType.SEND_FEEDBACK_REQUEST,
      { scheduleTime },
    ),
  );
}
