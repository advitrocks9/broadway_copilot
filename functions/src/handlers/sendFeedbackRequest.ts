import { ConversationStatus, MessageRole, PendingType, Prisma, PrismaClient } from "@prisma/client";
import { sendWhatsAppText } from "../utils/twilio";

export type SendFeedbackRequestPayload = {
  userId: string;
  conversationId: string;
};

export type SendFeedbackRequestResult = {
  message: string;
  skipped: boolean;
};

const FEEDBACK_PROMPT =
  "I'd love to hear how this conversation went for you—was I helpful? Any thoughts or ideas you share help me keep improving for next time.";

export async function sendFeedbackRequestHandler(
  prisma: PrismaClient,
  payload: SendFeedbackRequestPayload,
): Promise<SendFeedbackRequestResult> {
  const { userId, conversationId } = payload;
  console.info({ message: "Processing feedback request", payload });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { id: true, whatsappId: true } },
      feedback: { select: { id: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, role: true, pending: true },
      },
    },
  });

  if (!conversation || conversation.userId !== userId) {
    throw new Error("Conversation not found for user");
  }

  if (!conversation.user.whatsappId) {
    throw new Error("User is missing whatsappId");
  }

  if (conversation.status !== ConversationStatus.OPEN) {
    console.info({ message: "Conversation already closed, skipping feedback request", payload });
    return { message: "Conversation not open", skipped: true };
  }

  const lastMessage = conversation.messages.at(0);

  if (!lastMessage) {
    console.info({ message: "No messages found, skipping feedback request", payload });
    return { message: "No messages found", skipped: true };
  }

  if (conversation.feedback) {
    console.info({ message: "Conversation already has feedback", payload });
    return { message: "Feedback already recorded", skipped: true };
  }

  if (lastMessage.role !== MessageRole.AI) {
    console.info({ message: "Last message is not from AI, skipping", payload });
    return { message: "Last message was not from AI", skipped: true };
  }

  if (lastMessage.pending && lastMessage.pending !== PendingType.NONE) {
    console.info({ message: "Last message has pending action, skipping", payload });
    return { message: "Last message pending is not NONE", skipped: true };
  }

  await sendWhatsAppText({ to: conversation.user.whatsappId, body: FEEDBACK_PROMPT });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: MessageRole.AI,
      content: [{ type: "text", text: FEEDBACK_PROMPT }] as Prisma.InputJsonValue[],
      pending: PendingType.FEEDBACK,
    },
  });

  console.info({ message: "Feedback request sent", payload });
  return { message: "Feedback request sent", skipped: false };
}
