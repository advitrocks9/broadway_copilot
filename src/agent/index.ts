import "dotenv/config";

import { Conversation, GraphRunStatus, PendingType, MessageRole } from "@prisma/client";
import { StateGraph } from "../lib/graph";
import { GraphState } from "./state";
import { logError } from "../utils/errors";
import { logger } from "../utils/logger";
import { TwilioWebhookRequest } from "../lib/twilio/types";
import { getOrCreateUserAndConversation } from "../utils/context";
import { sendText } from "../lib/twilio";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { buildAgentGraph } from "./graph";

let compiledApp: ReturnType<typeof StateGraph.prototype.compile> | null = null;
let subscriber: ReturnType<typeof redis.duplicate> | undefined;

const getUserAbortChannel = (id: string) => `user_abort:${id}`;

async function getSubscriber() {
  if (!subscriber || !subscriber.isOpen) {
    subscriber = redis.duplicate();
    await subscriber.connect();
  }
  return subscriber;
}

/**
 * Builds and compiles the agent's state graph. This function should be called
 * once at application startup.
 */
export async function initializeAgent(): Promise<void> {
  logger.info("Compiling agent graph...");
  try {
    compiledApp = buildAgentGraph();
    logger.info("Agent graph compiled successfully.");
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { err: error.message, stack: error.stack },
      "Agent graph compilation failed",
    );
    throw error;
  }
}

async function logGraphResult(
  graphRunId: string,
  status: GraphRunStatus,
  finalState: Partial<GraphState> | null,
  error?: unknown,
): Promise<void> {
  try {
    const graphRun = await prisma.graphRun.findUnique({
      where: { id: graphRunId },
    });
    if (!graphRun) return;

    const endTime = new Date();
    const durationMs = endTime.getTime() - graphRun.startTime.getTime();

    if (finalState?.traceBuffer) {
      const { nodeRuns, llmTraces } = finalState.traceBuffer;
      const promises: Promise<any>[] = [];
      if (nodeRuns.length > 0) {
        promises.push(
          prisma.nodeRun.createMany({
            data: nodeRuns.map((ne) => ({
              ...ne,
              graphRunId,
            })),
          }),
        );
      }
      if (llmTraces.length > 0) {
        promises.push(
          prisma.lLMTrace.createMany({
            data: llmTraces.map((lt) => ({
              ...lt,
            })),
          }),
        );
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      delete finalState.traceBuffer;
    }

    await prisma.graphRun.update({
      where: { id: graphRunId },
      data: {
        finalState: finalState as any,
        status,
        errorTrace: error
          ? error instanceof Error
            ? error.stack
            : String(error)
          : undefined,
        endTime,
        durationMs,
      },
    });
  } catch (logErr: unknown) {
    logger.error(
      {
        err: logErr instanceof Error ? logErr.message : String(logErr),
        graphRunId,
      },
      "Failed to log graph result",
    );
  }
}

/**
 * Executes the agent graph for a single message with proper error handling and abort support.
 *
 * @param input - Raw Twilio webhook payload containing message data
 * @param options - Optional configuration including abort signal
 */
export async function runAgent(
  userId: string,
  messageId: string,
  input: TwilioWebhookRequest,
): Promise<void> {
  const controller = new AbortController();
  const sub = await getSubscriber();
  const channel = getUserAbortChannel(userId);

  const listener = (message: string) => {
    if (message === messageId) {
      controller.abort();
    }
  };
  sub.subscribe(channel, listener);

  const { WaId: whatsappId, ProfileName: profileName } = input;

  if (!whatsappId) {
    throw new Error("Whatsapp ID not found in webhook payload");
  }

  if (!compiledApp) {
    throw new Error(
      "Agent not initialized. Call initializeAgent() on startup.",
    );
  }

  let conversation: Conversation | undefined;
  let finalState: Partial<GraphState> | null = null;
  const graphRunId = messageId;
  try {
    const { user, conversation: _conversation } =
      await getOrCreateUserAndConversation(whatsappId, profileName);
    conversation = _conversation;

    await prisma.graphRun.create({
      data: {
        id: graphRunId,
        userId: user.id,
        conversationId: conversation.id,
        initialState: { input, user },
      },
    });

    finalState = await compiledApp.invoke(
      {
        input,
        user,
        graphRunId,
        conversationId: conversation.id,
        traceBuffer: { nodeRuns: [], llmTraces: [] },
      },
      { signal: controller.signal, runId: graphRunId },
    );
    logGraphResult(graphRunId, "COMPLETED", finalState);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      logGraphResult(graphRunId, "ABORTED", finalState, err);
      throw err;
    }
    logGraphResult(graphRunId, "ERROR", finalState, err);

    const error = logError(err, {
      whatsappId,
      messageId,
      location: "runAgent",
    });
    try {
      await sendText(
        whatsappId,
        "Sorry, something went wrong. Please try again later.",
      );
      if (conversation) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: MessageRole.AI,
            content: [
              {
                type: "text",
                text: "Sorry, something went wrong. Please try again later.",
              },
            ],
            pending: PendingType.NONE,
          },
        });
      }
    } catch (sendErr: unknown) {
      logError(sendErr, {
        whatsappId,
        messageId,
        location: "runAgent.sendTextFallback",
        originalError: error.message,
      });
    }
    throw error;
  } finally {
    await sub.unsubscribe(channel);
  }
}
