import 'dotenv/config';
import OpenAI from 'openai';
import { HttpFunction } from '@google-cloud/functions-framework';
import { PrismaClient, Prisma } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { MEMORY_EXTRACTION_PROMPT, WARDROBE_INDEXING_PROMPT } from './prompts';
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';

const prisma = new PrismaClient();
const storage = new Storage();

/**
 * Creates an embedding for a given text using OpenAI's API.
 * @param openai - The OpenAI client instance.
 * @param input - The text to create an embedding for.
 * @param model - The embedding model to use.
 * @returns An object containing the embedding, model, and dimensions.
 */
const getEmbedding = async (
  openai: OpenAI,
  input: string,
  model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
) => {
  const response = await openai.embeddings.create({
    model,
    input,
  });
  return {
    embedding: response.data[0].embedding,
    model,
    dimensions: response.data[0].embedding.length,
  };
};

/**
 * Formats the content of a message into a string.
 * @param content - The message content, expected to be an array of objects with a 'text' property.
 * @returns The formatted string content.
 */
const formatMessageContent = (content: Prisma.JsonValue[]): string => {
  if (!Array.isArray(content)) {
    return 'No content';
  }
  const textParts = content
    .filter(
      (part: any): part is { type: 'text'; text: string } =>
        part && part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text);

  return textParts.length > 0 ? textParts.join(' ') : 'No text content';
};

/**
 * An HTTP Cloud Function that uploads images to Google Cloud Storage.
 * It fetches all media records with `isUploaded` set to false and uploads them in parallel.
 * @param req - The HTTP request object.
 * @param res - The HTTP response object.
 */
export const imageUpload: HttpFunction = async (req, res) => {
  const taskId = req.headers["x-cloudtasks-taskname"] as string;

  if (!taskId) {
    return res.status(400).send({ message: "Missing x-cloudtasks-taskname header" });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { taskId },
    });

    if (!task) {
      console.error(`[ERROR] Task not found for taskId: ${taskId}`);
      return res.status(404).send({ message: "Task not found" });
    }

    const { userId, messageId } = task.payload as { userId: string, messageId: string };
    if (!userId || !messageId) {
      throw new Error(`Invalid payload for task ${taskId}`);
    }

    console.log(`[INFO] Starting image upload job for userId: ${userId}, messageId: ${messageId}.`);

    if (!process.env.GCS_BUCKET_NAME) {
      throw new Error("GCS_BUCKET_NAME environment variable not set");
    }
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

    await prisma.task.update({
      where: { taskId },
      data: { status: "IN_PROGRESS" },
    });

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "image-uploads-"));

    try {
      const imagesToUpload = await prisma.media.findMany({
        where: {
          isUploaded: false,
          messageId: messageId,
        },
        include: {
          message: {
            include: {
              conversation: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

      if (imagesToUpload.length === 0) {
        console.log(`[INFO] No new images to upload for message ${messageId}.`);
        await prisma.task.update({
          where: { taskId },
          data: { status: "COMPLETED" },
        });
        res.status(200).send({ message: "No new images to upload." });
        return;
      }

      console.log(`[INFO] Found ${imagesToUpload.length} images to upload.`);

      const uploadPromises = imagesToUpload.map(async (image) => {
        let tempFilePath: string | undefined;
        try {
          const response = await fetch(image.serverUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image from ${image.serverUrl}: ${response.statusText}`);
          }

          if (!response.body) {
            throw new Error(`Response body is null for image ${image.serverUrl}`);
          }

          const extension = image.mimeType.split("/")[1] || "jpg";
          const userId = image.message.conversation.userId;
          tempFilePath = path.join(tempDir, `${randomUUID()}.${extension}`);

          await pipeline(response.body, createWriteStream(tempFilePath));

          const fileName = `uploads/${userId}/${randomUUID()}.${extension}`;

          await bucket.upload(tempFilePath, {
            destination: fileName,
            metadata: {
              contentType: image.mimeType,
            },
          });

          const gcsUri = `gs://${bucket.name}/${fileName}`;

          await prisma.media.update({
            where: { id: image.id },
            data: {
              gcsUri: gcsUri,
              isUploaded: true,
            },
          });

          console.log(`[INFO] Successfully uploaded ${image.serverUrl} to ${gcsUri}`);
          return { status: "success", imageId: image.id };
        } catch (error) {
          console.error(`[ERROR] Failed to upload image ${image.id}:`, error);
          return { status: "error", imageId: image.id, error };
        } finally {
          if (tempFilePath) {
            await fs.unlink(tempFilePath).catch((err) => {
              console.error(`[ERROR] Failed to delete temp file ${tempFilePath}`, err);
            });
          }
        }
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((r) => r.status === "success").length;
      const errorCount = results.length - successCount;

      console.log(
        `[INFO] Image upload job finished. Success: ${successCount}, Failed: ${errorCount}`
      );
      await prisma.task.update({
        where: { taskId },
        data: { status: "COMPLETED" },
      });
      res.status(200).send({
        message: "Image upload job finished.",
        successCount,
        errorCount,
      });
    } catch (error) {
      console.error("[ERROR] Error in image upload job:", error);
      await prisma.task.update({
        where: { taskId },
        data: { status: "FAILED" },
      });
      res.status(500).send({ message: "Internal Server Error" });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((err) => {
        console.error(`[ERROR] Failed to delete temp directory ${tempDir}`, err);
      });
    }
  } catch (error: any) {
    console.error(`[ERROR] Error processing task ${taskId}:`, error);
    try {
      await prisma.task.update({
        where: { taskId },
        data: { status: "FAILED" },
      });
    } catch (updateError) {
      console.error(`[ERROR] Failed to update task ${taskId} status to FAILED:`, updateError);
    }
    res.status(500).send({ message: "Internal Server Error" });
  }
};

/**
 * A Cloud Task handler that extracts memories from a conversation and stores them with embeddings.
 * @param req - The HTTP request object from Cloud Tasks.
 * @param res - The HTTP response object.
 */
export const storeMemories: HttpFunction = async (req, res) => {
  const taskId = req.headers['x-cloudtasks-taskname'] as string;

  if (!taskId) {
    return res.status(400).send({ message: 'Missing x-cloudtasks-taskname header' });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { taskId },
    });

    if (!task) {
      console.error(`[ERROR] Task not found for taskId: ${taskId}`);
      return res.status(404).send({ message: 'Task not found' });
    }

    const { userId, conversationId } = task.payload as { userId: string; conversationId: string };
    if (!userId || !conversationId) {
      throw new Error(`Invalid payload for task ${taskId}`);
    }

    console.log(
      `[INFO] Starting memory storage for userId: ${userId}, conversationId: ${conversationId}`
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    await prisma.task.update({
      where: { taskId },
      data: { status: 'IN_PROGRESS' },
    });

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        memoriesProcessed: false,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      console.warn(`[WARN] No new messages to process for memories in conversation ${conversationId}`);
      await prisma.task.update({
        where: { taskId },
        data: { status: 'COMPLETED' },
      });
      return res.status(200).send({ message: 'No messages to process.' });
    }

    const chatHistory = messages
      .map((m) => `${m.role}: ${formatMessageContent(m.content)}`)
      .join('\n');

    const response = await openai.responses.create({
      model: 'gpt-5-nano',
      instructions: `${MEMORY_EXTRACTION_PROMPT}\n\nReturn a JSON object.`,
      input: chatHistory,
    });

    const result = JSON.parse(response.output_text || '{}');

    if (result.memories && result.memories.length > 0) {
      for (const memory of result.memories) {
        const memoryString = `${memory.key}: ${memory.value}`;
        const { embedding, model, dimensions } = await getEmbedding(openai, memoryString);

        const createdMemory = await prisma.memory.create({
          data: {
            userId,
            memory: memoryString,
            embeddingModel: model,
            embeddingDim: dimensions,
          },
        });

        await prisma.$executeRaw`UPDATE "Memory" SET embedding = ${embedding}::vector WHERE id = ${createdMemory.id}`;
      }
      console.log(`[INFO] Stored ${result.memories.length} memories for user ${userId}.`);
    }

    // Mark messages as processed
    const messageIds = messages.map((m) => m.id);
    await prisma.message.updateMany({
      where: {
        id: {
          in: messageIds,
        },
      },
      data: {
        memoriesProcessed: true,
      },
    });

    await prisma.task.update({
      where: { taskId },
      data: { status: 'COMPLETED' },
    });

    res.status(200).send({ message: 'Successfully stored memories.' });
  } catch (error: any) {
    console.error(`[ERROR] Error storing memories for task ${taskId}:`, error.message);
    try {
      await prisma.task.update({
        where: { taskId },
        data: { status: 'FAILED' },
      });
    } catch (updateError) {
      console.error(`[ERROR] Failed to update task ${taskId} status to FAILED:`, updateError);
    }
    res.status(500).send({ message: 'Internal Server Error' });
  }
};

/**
 * A Cloud Task handler that indexes wardrobe items from images in a message.
 * @param req - The HTTP request object from Cloud Tasks.
 * @param res - The HTTP response object.
 */
export const indexWardrobe: HttpFunction = async (req, res) => {
  const taskId = req.headers['x-cloudtasks-taskname'] as string;

  if (!taskId) {
    return res.status(400).send({ message: 'Missing x-cloudtasks-taskname header' });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { taskId },
    });

    if (!task) {
      console.error(`[ERROR] Task not found for taskId: ${taskId}`);
      return res.status(404).send({ message: 'Task not found' });
    }

    const { userId, messageId } = task.payload as { userId: string; messageId: string };
    if (!userId || !messageId) {
      throw new Error(`Invalid payload for task ${taskId}`);
    }

    console.log(
      `[INFO] Starting wardrobe indexing for userId: ${userId}, messageId: ${messageId}`
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    await prisma.task.update({
      where: { taskId },
      data: { status: 'IN_PROGRESS' },
    });

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { media: true },
    });

    if (!message || !message.media || message.media.length === 0) {
      console.warn(`[WARN] No media found for message ${messageId}`);
      await prisma.task.update({
        where: { taskId },
        data: { status: 'COMPLETED' },
      });
      return res.status(200).send({ message: 'No media to process.' });
    }

    let itemsCreated = 0;
    const model = 'gpt-5-mini';

    for (const media of message.media) {
      if (!media.mimeType.startsWith('image/')) continue;

      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: WARDROBE_INDEXING_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: media.serverUrl,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      if (result.status === 'ok' && result.items && result.items.length > 0) {
        for (const item of result.items) {
          const name = `${item.attributes.color_primary || ''} ${item.type}`.trim();
          const description = Object.entries(item.attributes)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');

          const embeddingText = `${name} - ${description}`;
          const { embedding, model, dimensions } = await getEmbedding(openai, embeddingText);

          const createdItem = await prisma.wardrobeItem.create({
            data: {
              userId,
              name,
              nameLower: name.toLowerCase(),
              category: item.category,
              type: item.type,
              subtype: item.subtype,
              description,
              attributes: item.attributes,
              colors: [
                item.attributes.color_primary,
                item.attributes.color_secondary,
              ].filter(Boolean),
              embeddingModel: model,
              embeddingDim: dimensions,
            },
          });

          await prisma.$executeRaw`UPDATE "WardrobeItem" SET embedding = ${embedding}::vector WHERE id = ${createdItem.id}`;
          itemsCreated++;
        }
      }
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { wardrobeProcessed: true },
    });

    await prisma.task.update({
      where: { taskId },
      data: { status: 'COMPLETED' },
    });

    console.log(`[INFO] Wardrobe indexing finished for message ${messageId}. Created ${itemsCreated} items.`);
    res.status(200).send({ message: `Created ${itemsCreated} wardrobe items.` });
  } catch (error: any) {
    console.error(`[ERROR] Error indexing wardrobe for task ${taskId}:`, error.message);
    try {
      await prisma.task.update({
        where: { taskId },
        data: { status: 'FAILED' },
      });
    } catch (updateError) {
      console.error(`[ERROR] Failed to update task ${taskId} status to FAILED:`, updateError);
    }
    res.status(500).send({ message: 'Internal Server Error' });
  }
};