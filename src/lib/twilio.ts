import "dotenv/config";

import twilio, { Twilio } from "twilio";
import { Request } from "express";

import RequestClient from "twilio/lib/base/RequestClient";
import { redis } from "./redis";
import {
  TWILIO_WHATSAPP_FROM,
  TWILIO_QUICKREPLY2_SID,
  TWILIO_QUICKREPLY3_SID,
} from "../utils/constants";
import { logger } from "../utils/logger";
import {
  BadRequestError,
  InternalServerError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "../utils/errors";

import {
  QuickReplyButton,
  TwilioApiError,
  TwilioMessageOptions,
  TwilioStatusCallbackPayload,
} from "./twilio/types";

let subscriber: ReturnType<typeof redis.duplicate> | undefined;

async function getSubscriber() {
  if (!subscriber || !subscriber.isOpen) {
    subscriber = redis.duplicate();
    await subscriber.connect();
  }
  return subscriber;
}

let cachedClient: Twilio | undefined;

/**
 * Retrieves or initializes a Twilio client with optimized configuration.
 * @returns The Twilio client instance.
 * @throws {HttpError} If Twilio credentials are missing.
 */
function getTwilioClient(): Twilio {
  if (cachedClient) return cachedClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken)
    throw new InternalServerError("Twilio credentials missing");

  const httpClient = new RequestClient({
    keepAlive: true,
    timeout: Number(process.env.TWILIO_HTTP_TIMEOUT_MS || 10000),
  });

  const clientOptions: Record<string, unknown> = {
    httpClient,
    userAgentExtensions: ["broadway-copilot"],
  };
  clientOptions.edge = "singapore";
  cachedClient = twilio(accountSid, authToken, clientOptions);
  return cachedClient;
}

/**
 * Sends a text message via Twilio WhatsApp API, optionally with an image.
 * @param to - Recipient's WhatsApp identifier.
 * @param body - Message text.
 * @param imageUrl - Optional image URL.
 * @throws {HttpError} If sending fails.
 */
export async function sendText(
  to: string,
  body: string,
  imageUrl?: string,
): Promise<void> {
  const client = getTwilioClient();
  const fromNumber = TWILIO_WHATSAPP_FROM;
  try {
    const messageOptions: TwilioMessageOptions = {
      body,
      from: fromNumber,
      to: `whatsapp:+${to}`,
    };
    if (imageUrl) {
      messageOptions.mediaUrl = [imageUrl];
    }
    addStatusCallback(messageOptions);
    const resp = await client.messages.create(messageOptions);
    logger.debug({ sid: resp.sid, to }, "Sent text message");
    await awaitStatuses(resp.sid);
  } catch (err: unknown) {
    handleTwilioError(err as TwilioApiError);
  }
}

/**
 * Sends a menu message with quick reply buttons via Twilio.
 * Falls back to plain text if button count is invalid.
 * @param to - Recipient's WhatsApp identifier.
 * @param replyText - Message text.
 * @param buttons - Array of 2-3 quick reply buttons.
 * @throws {HttpError} If sending fails.
 */
export async function sendMenu(
  to: string,
  replyText: string,
  buttons?: readonly QuickReplyButton[],
): Promise<void> {
  const client = getTwilioClient();

  if (!buttons || buttons.length === 0) {
    logger.warn("No buttons provided for menu; falling back to text");
    await sendText(to, replyText);
    return;
  }

  if (buttons.length < 2 || buttons.length > 3) {
    logger.warn(
      `Invalid button count ${buttons.length}; must be 2-3 buttons. Falling back to text`,
    );
    await sendText(to, replyText);
    return;
  }

  const contentSid =
    buttons.length === 2 ? TWILIO_QUICKREPLY2_SID : TWILIO_QUICKREPLY3_SID;
  const fromNumber = TWILIO_WHATSAPP_FROM;

  const contentVariables: Record<string, string> = {
    "1": replyText,
    "2": buttons[0].text,
    "3": buttons[0].id,
    "4": buttons[1].text,
    "5": buttons[1].id,
  };

  if (buttons.length === 3) {
    contentVariables["6"] = buttons[2].text;
    contentVariables["7"] = buttons[2].id;
  }

  try {
    const payload: TwilioMessageOptions = {
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
      from: fromNumber,
      to: `whatsapp:+${to}`,
    };

    addStatusCallback(payload);
    const resp = await client.messages.create(payload);
    logger.debug(
      { sid: resp.sid, to, buttonCount: buttons.length },
      "Sent menu message with buttons",
    );
    await awaitStatuses(resp.sid);
  } catch (err: unknown) {
    handleTwilioError(err as TwilioApiError);
  }
}

/**
 * Sends an image message with optional caption via Twilio.
 * @param to - Recipient's WhatsApp identifier.
 * @param imageUrl - Image URL.
 * @param caption - Optional caption text.
 * @throws {HttpError} If sending fails.
 */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  await sendText(to, caption || "", imageUrl);
  logger.debug({ to, imageUrl }, "Sent image message");
}

/**
 * Waits for message status updates with timeouts.
 * @param sid - Message SID.
 */
async function awaitStatuses(sid: string): Promise<void> {
  const configuredToWait = process.env.TWILIO_WAIT_FOR_STATUS === "true";
  if (!configuredToWait) return;
  logger.debug({ sid }, "Waiting for message status updates");
  const sentTimeoutMs = Number(process.env.TWILIO_SENT_TIMEOUT_MS || 5000);
  const deliveredTimeoutMs = Number(
    process.env.TWILIO_DELIVERED_TIMEOUT_MS || 15000,
  );

  const channel = `twilio:status:${sid}`;
  const seenStatusesKey = `twilio:seen:${sid}`;

  const sub = await getSubscriber();

  let resolveSent!: () => void;
  let resolveDelivered!: () => void;

  const sentPromise = new Promise<void>((resolve) => {
    resolveSent = resolve;
  });
  const deliveredPromise = new Promise<void>((resolve) => {
    resolveDelivered = resolve;
  });

  const listener = (message: string) => {
    if (message === "sent") {
      resolveSent();
    } else if (
      message === "delivered" ||
      message === "failed" ||
      message === "undelivered"
    ) {
      resolveDelivered();
    }
  };

  sub.subscribe(channel, listener);

  // Check for statuses that arrived before we subscribed
  const preSeenStatuses = await redis.sMembers(seenStatusesKey);
  if (preSeenStatuses.includes("sent")) {
    resolveSent();
  }
  if (
    preSeenStatuses.some((s) =>
      ["delivered", "failed", "undelivered"].includes(s),
    )
  ) {
    resolveDelivered();
  }

  const sentTimer = setTimeout(() => {
    logger.warn(
      { sid, timeout: sentTimeoutMs },
      'Timed out waiting for "sent" status',
    );
    resolveSent();
  }, sentTimeoutMs);

  await sentPromise;
  clearTimeout(sentTimer);
  logger.debug({ sid }, 'Received "sent" status');

  const deliveredTimer = setTimeout(() => {
    logger.warn(
      { sid, timeout: deliveredTimeoutMs },
      'Timed out waiting for "delivered" status',
    );
    resolveDelivered();
  }, deliveredTimeoutMs);

  await deliveredPromise;
  clearTimeout(deliveredTimer);
  logger.debug({ sid }, 'Received "delivered" status');

  await sub.unsubscribe(channel);
  redis.del(seenStatusesKey);
}

/**
 * Adds status callback URL to message options if configured.
 * @param options - Message options to modify.
 */
function addStatusCallback(options: TwilioMessageOptions): void {
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, "") || "";
  if (serverUrl) {
    options.statusCallback = `${serverUrl}/twilio/callback/`;
  }
}

/**
 * Handles Twilio API errors and throws appropriate HttpError.
 * @param err - The Twilio error.
 * @throws {HttpError} Normalized error.
 */
function handleTwilioError(err: TwilioApiError): never {
  if (err && err.code === 20003) {
    logger.error(
      "Twilio auth failed (401). Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
    throw new UnauthorizedError("Twilio authentication failed");
  }

  if (err && err.code === 21211) {
    logger.error("Invalid phone number format");
    throw new BadRequestError("Invalid phone number format");
  }

  if (err && err.code === 21610) {
    logger.error("Message blocked by carrier");
    throw new ServiceUnavailableError("Message delivery blocked");
  }

  logger.error({ err }, "Twilio API error");
  throw new ServiceUnavailableError("Message delivery failed");
}

/**
 * Validates incoming Twilio request authenticity.
 * @param req - Express request object.
 * @returns True if valid, false otherwise.
 */
export function validateTwilioRequest(req: Request): boolean {
  try {
    const signature =
      req.header("X-Twilio-Signature") || req.header("x-twilio-signature");
    const protoHeader =
      (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const hostHeader =
      (req.headers["x-forwarded-host"] as string) ||
      (req.get("host") as string);
    const fullUrl = `${protoHeader}://${hostHeader}${req.originalUrl}`;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (process.env.TWILIO_VALIDATE_WEBHOOK === "false") return true;
    if (!authToken) {
      logger.warn("Twilio auth token not configured");
      return false;
    }
    if (!signature) {
      logger.warn("Missing Twilio signature header");
      return false;
    }
    return twilio.validateRequest(authToken, signature, fullUrl, req.body);
  } catch (err: any) {
    logger.error({ err: err?.message }, "Error validating Twilio request");
    return false;
  }
}

/**
 * Processes Twilio status callback and resolves promises.
 * @param payload - Status callback payload.
 */
export function processStatusCallback(
  payload: TwilioStatusCallbackPayload,
): void {
  if (!payload) {
    logger.warn("Empty callback payload received");
    return;
  }

  const sid: string | undefined = payload?.MessageSid || payload?.SmsSid;
  const status: string | undefined =
    payload?.MessageStatus || payload?.SmsStatus;

  if (!sid || !status) {
    logger.warn({ payload }, "Invalid callback payload: missing sid or status");
    return;
  }

  const statusLower = status.toLowerCase();
  const channel = `twilio:status:${sid}`;
  const seenStatusesKey = `twilio:seen:${sid}`;

  redis.publish(channel, statusLower);

  // Store status in case callback arrives before listener is ready
  redis.sAdd(seenStatusesKey, statusLower);
  redis.expire(seenStatusesKey, 300); // 5 minutes TTL

  switch (statusLower) {
    case "sent":
      logger.debug({ sid }, "Message sent successfully");
      break;
    case "delivered":
      logger.info({ sid }, "Message delivered successfully");
      break;
    case "failed":
    case "undelivered":
      logger.warn({ sid, status }, "Message delivery failed");
      break;
    case "queued":
    case "sending":
      break;
    default:
      logger.warn(
        { sid, status: statusLower },
        "Unknown message status received",
      );
  }
}
