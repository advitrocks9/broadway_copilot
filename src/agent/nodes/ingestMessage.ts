import { AssistantMessage, UserMessage, MessageContent } from "../../lib/ai";
import { MessageRole, PendingType } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { downloadTwilioMedia } from "../../utils/media";
import { extractTextContent } from "../../utils/text";
import { logger } from "../../utils/logger";
import { GraphState } from "../state";
import { queueImageUpload } from "../../lib/tasks";

/**
 * Ingests incoming Twilio messages, processes media attachments, manages conversation history,
 * and prepares data for downstream processing in the agent graph.
 *
 * Handles message merging for multi-part messages, media download and storage,
 * and conversation history preparation with both image and text-only versions.
 */
export async function ingestMessage(state: GraphState): Promise<GraphState> {
  const { input, user, conversationId, graphRunId } = state;
  const {
    Body: text,
    ButtonPayload: buttonPayload,
    NumMedia: numMedia,
    MediaUrl0: mediaUrl0,
    MediaContentType0: mediaContentType0,
    WaId: whatsappId,
  } = input;

  if (!whatsappId) {
    throw new Error("Whatsapp ID not found in webhook payload");
  }

  let media:
    | { serverUrl: string; twilioUrl: string; mimeType: string }
    | undefined;
  let content: MessageContent = [{ type: "text", text }];
  if (
    numMedia === "1" &&
    mediaUrl0 &&
    mediaContentType0?.startsWith("image/")
  ) {
    try {
      const serverUrl = await downloadTwilioMedia(
        mediaUrl0,
        whatsappId,
        mediaContentType0,
      );
      content.push({ type: "image_url", image_url: { url: serverUrl } });
      media = { serverUrl, twilioUrl: mediaUrl0, mimeType: mediaContentType0 };
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          whatsappId,
          mediaUrl0,
        },
        "Failed to download image, proceeding without it.",
      );
    }
  }

  const { savedMessage, messages, pending } = await prisma.$transaction(
    async (tx) => {
      const [lastMessage, latestAssistantMessage] = await Promise.all([
        tx.message.findFirst({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          select: { id: true, role: true, content: true },
        }),
        tx.message.findFirst({
          where: {
            conversation: { id: conversationId, userId: user.id },
            role: MessageRole.AI,
          },
          orderBy: { createdAt: "desc" },
          select: { pending: true },
        }),
      ]);

      const pendingState = latestAssistantMessage?.pending ?? PendingType.NONE;

      let savedMessage;
      if (lastMessage && lastMessage.role === MessageRole.USER) {
        const existingContent = lastMessage.content as MessageContent;
        const mergedContent = [...existingContent, ...content];

        savedMessage = await tx.message.update({
          where: { id: lastMessage.id },
          data: {
            content: mergedContent,
            ...(buttonPayload != null && { buttonPayload }),
            ...(media && {
              media: {
                create: {
                  twilioUrl: media.twilioUrl,
                  serverUrl: media.serverUrl,
                  mimeType: media.mimeType,
                },
              },
            }),
          },
        });
      } else {
        savedMessage = await tx.message.create({
          data: {
            conversationId,
            role: MessageRole.USER,
            content,
            ...(buttonPayload != null && { buttonPayload }),
            ...(media && {
              media: {
                create: {
                  twilioUrl: media.twilioUrl,
                  serverUrl: media.serverUrl,
                  mimeType: media.mimeType,
                },
              },
            }),
          },
        });
      }

      const messages = await tx.message.findMany({
        where: {
          conversationId,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          role: true,
          content: true,
          buttonPayload: true,
          createdAt: true,
        },
      });

      return { savedMessage, messages, pending: pendingState };
    },
  );

  await queueImageUpload(user.id, savedMessage.id);

  const conversationHistoryWithImages = messages.reverse().map((msg) => {
    if (msg.role === MessageRole.USER) {
      const message = new UserMessage(msg.content as MessageContent);
      message.meta = {
        createdAt: msg.createdAt,
        buttonPayload: msg.buttonPayload,
        messageId: msg.id,
      };
      return message;
    } else {
      const message = new AssistantMessage("");
      message.content = msg.content as MessageContent;
      message.meta = { createdAt: msg.createdAt, messageId: msg.id };
      return message;
    }
  });

  const conversationHistoryTextOnly = conversationHistoryWithImages.map(
    (msg) => {
      const textContent = extractTextContent(msg.content as MessageContent);

      if (msg instanceof UserMessage) {
        const message = new UserMessage(textContent);
        message.meta = msg.meta;
        return message;
      } else {
        const message = new AssistantMessage(textContent);
        message.meta = msg.meta;
        return message;
      }
    },
  );

  logger.debug({ whatsappId, graphRunId }, "Message ingested successfully");

  return {
    ...state,
    conversationHistoryWithImages,
    conversationHistoryTextOnly,
    pending,
    user,
    input,
  };
}
