import "dotenv/config";

import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import { authenticateRequest } from "./middleware/auth";
import { errorHandler } from "./middleware/errors";
import { rateLimiter } from "./middleware/rateLimiter";
import { whitelist } from "./middleware/whitelist";
import { initializeAgent, runAgent } from "./agent";
import { connectRedis, redis } from "./lib/redis";
import { connectPrisma } from "./lib/prisma";
import { processStatusCallback } from "./lib/twilio";
import { TwilioWebhookRequest } from "./lib/twilio/types";
import { MESSAGE_TTL_SECONDS, USER_STATE_TTL_SECONDS } from "./utils/constants";
import { logger } from "./utils/logger";
import { staticUploadsMount } from "./utils/paths";

const app = express();
app.set("trust proxy", true);

app.use(
  cors({
    origin: [/http:\/\/localhost:\d+/, /http:\/\/127\.0\.0\.1:\d+/],
    credentials: true,
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/uploads", express.static(staticUploadsMount()));

const getMessageKey = (id: string) => `message:${id}`;
const getUserActiveKey = (id: string) => `user_active:${id}`;
const getUserQueueKey = (id: string) => `user_queue:${id}`;
const getUserAbortChannel = (id: string) => `user_abort:${id}`;

/**
 * Main Twilio webhook handler for incoming WhatsApp messages.
 * Handles message queuing, duplicate detection, and concurrency control.
 */
app.post(
  "/twilio/",
  authenticateRequest,
  whitelist,
  rateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const webhookPayload = req.body as TwilioWebhookRequest;
      const { WaId: userId, MessageSid: messageId } = webhookPayload;

      if (!userId) {
        logger.error(
          { payload: webhookPayload },
          "WaId is missing from Twilio webhook payload",
        );
        return res.status(400).send("Error: WaId not found");
      }

      logger.info({ userId, messageId }, "Received incoming message");

      const mk = getMessageKey(messageId);

      if ((await redis.exists(mk)) === 1) {
        logger.debug({ messageId }, "Message already processed, skipping");
        return res.status(200).end();
      }

      await redis.hSet(mk, {
        userId,
        status: "queued",
        createdAt: Date.now(),
      });
      await redis.expire(mk, MESSAGE_TTL_SECONDS);

      const uak = getUserActiveKey(userId);
      const currentActive = await redis.get(uak);
      const currentStatus = currentActive
        ? await redis.hGet(getMessageKey(currentActive), "status")
        : null;

      if (currentActive && currentStatus === "running") {
        await redis.publish(getUserAbortChannel(userId), currentActive);
        logger.info(
          { userId, abortedMessageId: currentActive },
          "Published abort signal for previous message processing",
        );
      }

      if (currentStatus === "sending") {
        const uqk = getUserQueueKey(userId);
        await redis.rPush(
          uqk,
          JSON.stringify({ messageId, input: webhookPayload }),
        );
        await redis.expire(uqk, USER_STATE_TTL_SECONDS);
        logger.debug(
          { messageId, userId },
          "Queued message due to active sending",
        );
        return res.status(200).end();
      } else {
        await redis.set(uak, messageId, { EX: USER_STATE_TTL_SECONDS });
        processMessage(userId, messageId, webhookPayload);
        return res.status(200).end();
      }
    } catch (err: unknown) {
      const messageId = (req.body as TwilioWebhookRequest)?.MessageSid;
      try {
        if (messageId) {
          const mk = getMessageKey(messageId);
          await redis.hSet(mk, { status: "failed" });
        }
      } catch (redisErr: unknown) {
        logger.warn(
          {
            messageId,
            err:
              redisErr instanceof Error ? redisErr.message : String(redisErr),
          },
          "Failed to set failed status for message",
        );
      }
      next(err);
    }
  },
);

/**
 * Twilio callback handler for message delivery status updates.
 */
app.post(
  "/twilio/callback/",
  authenticateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      processStatusCallback(req.body || {});
      return res.status(200).end();
    } catch (err: unknown) {
      next(err);
    }
  },
);

app.use(errorHandler);

/**
 * Processes a single message through the agent graph with concurrency control.
 * Manages message status, handles aborts, and processes queued messages.
 *
 * @param userId - The WhatsApp user ID
 * @param messageId - The Twilio message SID
 * @param input - The raw Twilio webhook payload
 */
async function processMessage(
  userId: string,
  messageId: string,
  input: TwilioWebhookRequest,
): Promise<void> {
  const mk = getMessageKey(messageId);

  try {
    await redis.hSet(mk, { status: "running" });

    await runAgent(userId, messageId, input);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.info({ userId, messageId }, "Message processing aborted");
    }

    try {
      await redis.hSet(mk, { status: "failed" });
    } catch (redisErr: unknown) {
      logger.error(
        {
          redisErr:
            redisErr instanceof Error ? redisErr.message : String(redisErr),
          userId,
          messageId,
        },
        "Failed to update message status in Redis",
      );
    }
  } finally {
    const uak = getUserActiveKey(userId);
    const activeMessageId = await redis.get(uak);

    if (activeMessageId === messageId) {
      try {
        const uqk = getUserQueueKey(userId);
        const nextStr = await redis.lPop(uqk);
        if (nextStr) {
          const next = JSON.parse(nextStr);
          await redis.set(uak, next.messageId, {
            EX: USER_STATE_TTL_SECONDS,
          });
          processMessage(userId, next.messageId, next.input);
        } else {
          await redis.del(uak);
        }
      } catch (queueErr: unknown) {
        logger.error(
          {
            userId,
            messageId,
            err:
              queueErr instanceof Error ? queueErr.message : String(queueErr),
          },
          "Failed to process message queue",
        );
      }
    }
  }
}

/**
 * Bootstrap function to initialize the server and connect to services.
 * Sets up Redis connection and starts the Express server.
 */
void (async function bootstrap() {
  try {
    await connectRedis();
    await connectPrisma();
    initializeAgent();
    const PORT = Number(process.env.PORT || 8080);
    app.listen(PORT, "0.0.0.0", () => {
      logger.info({ port: PORT }, "Broadway WhatsApp Bot server started");
    });
  } catch (err: unknown) {
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Server bootstrap failed",
    );
    process.exit(1);
  }
})();
