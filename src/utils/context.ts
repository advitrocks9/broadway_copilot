import { User, Conversation, ConversationStatus } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { queueMemoryExtraction } from "../lib/tasks";
import { logger } from "./logger";
import { BadRequestError, InternalServerError } from "./errors";

const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Retrieves or creates a user and their active conversation.
 * This function handles user lookup/creation, finds the last open conversation,
 * closes stale conversations, and creates new ones if needed.
 *
 * @param whatsappId - The user's WhatsApp ID.
 * @param profileName - The user's profile name.
 * @returns An object containing the user and their active conversation.
 */
export async function getOrCreateUserAndConversation(
  whatsappId: string,
  profileName?: string,
): Promise<{ user: User; conversation: Conversation }> {
  if (!whatsappId) {
    throw new BadRequestError("WhatsApp ID is required");
  }

  try {
    const userWithConversation = await prisma.user.findUnique({
      where: { whatsappId },
      include: {
        conversations: {
          where: { status: ConversationStatus.OPEN },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!userWithConversation) {
      logger.debug(
        { whatsappId },
        "User not found, creating new user and conversation.",
      );
      const newUser = await prisma.user.create({
        data: {
          whatsappId,
          profileName,
          conversations: {
            create: {},
          },
        },
        include: {
          conversations: true,
        },
      });
      const { conversations, ...user } = newUser;
      return { user, conversation: conversations[0] };
    }

    const { conversations, ...user } = userWithConversation;
    const lastOpenConversation = conversations[0];

    if (lastOpenConversation) {
      const timeSinceLastUpdate =
        Date.now() - new Date(lastOpenConversation.updatedAt).getTime();
      if (timeSinceLastUpdate > CONVERSATION_TIMEOUT_MS) {
        logger.debug(
          { userId: user.id, conversationId: lastOpenConversation.id },
          "Stale conversation detected, closing and creating a new one.",
        );

        const [, newConversation] = await prisma.$transaction([
          prisma.conversation.update({
            where: { id: lastOpenConversation.id },
            data: { status: ConversationStatus.CLOSED },
          }),
          prisma.conversation.create({
            data: { userId: user.id },
          }),
        ]);

        await queueMemoryExtraction(user.id, lastOpenConversation.id);
        logger.debug(
          { userId: user.id, conversationId: lastOpenConversation.id },
          "Queued memory extraction for closed conversation.",
        );

        return { user, conversation: newConversation };
      }
      return { user, conversation: lastOpenConversation };
    }

    logger.debug(
      { userId: user.id },
      "No open conversation found, creating a new one.",
    );
    const newConversation = await prisma.conversation.create({
      data: { userId: user.id },
    });
    return { user, conversation: newConversation };
  } catch (err: unknown) {
    throw new InternalServerError(
      "Failed to get or create user and conversation",
      { cause: err },
    );
  }
}

/**
 * Counts the number of image attachments in the most recent message.
 * Used to determine if image processing features should be triggered.
 *
 * @param conversationHistoryWithImages - Array of conversation messages with image data
 * @returns Number of image URLs in the latest message
 */
export function numImagesInMessage(
  conversationHistoryWithImages: any[],
): number {
  if (
    !conversationHistoryWithImages ||
    conversationHistoryWithImages.length === 0
  ) {
    return 0;
  }

  const latestMessage = conversationHistoryWithImages.at(-1);
  if (!latestMessage || !latestMessage.content) {
    return 0;
  }

  if (!Array.isArray(latestMessage.content)) {
    return 0;
  }

  return latestMessage.content.filter((item: any) => item.type === "image_url")
    .length;
}
