import prisma from '../../db/client';
import { getOrCreateUserByWaId } from '../../utils/user';
import { downloadTwilioMedia } from '../../utils/media';
import { getLogger } from '../../utils/logger';
import { HumanMessage, AIMessage, type MessageContent } from '@langchain/core/messages';
import { MessageRole, PendingType, User } from '@prisma/client';

const logger = getLogger('node:ingest_message');

export async function ingestMessageNode(state: any): Promise<any> {

  const text = state.input.Body;
  const buttonPayload = state.input.ButtonPayload;
  const buttonText = state.input.ButtonText;
  const numMedia = state.input.NumMedia;
  const mediaUrl0 = state.input.MediaUrl0;
  const mediaContentType0 = state.input.MediaContentType0;
  const waId = state.input.From;

  const user: User = await getOrCreateUserByWaId(waId);

  let content: MessageContent = [{ type: 'text', text }];
  if (numMedia == 1 && mediaUrl0 && mediaContentType0.startsWith('image/')) {

    let imagePath: string | undefined;

    try {
      imagePath = await downloadTwilioMedia(mediaUrl0, waId, mediaContentType0);
      content.push({ type: 'image_url', image_url: { url: imagePath } });
    } catch (err) {
      logger.error({ err }, 'IngestMessage: failed to download/process media');
    }
  }

  const lastMessage = await prisma.message.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, role: true, content: true, pending: true }
  });

  const latestAssistantMessage = await prisma.message.findFirst({
    where: {
      userId: user.id,
      role: MessageRole.AI
    },
    orderBy: { createdAt: 'desc' },
    select: { pending: true }
  });

  const pending = latestAssistantMessage?.pending ?? PendingType.NONE;

  if (lastMessage && lastMessage.role === MessageRole.USER) {
    const existingContent = lastMessage.content as MessageContent[];
    const mergedContent = [...existingContent, ...content];

    const updateData: any = { content: mergedContent };
    if (buttonPayload !== null && buttonText !== null) {
      updateData.buttonPayload = buttonPayload;
      updateData.buttonText = buttonText;
    }

    await prisma.message.update({
      where: { id: lastMessage.id },
      data: updateData
    });
  } else {
    const createData: any = {
      userId: user.id,
      role: MessageRole.USER,
      content,
    };
    if (buttonPayload !== null) {
      createData.buttonPayload = buttonPayload;
    }
    if (buttonText !== null) {
      createData.buttonText = buttonText;
    }

    await prisma.message.create({
      data: createData
    });
  }

  const messages = await prisma.message.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      role: true,
      content: true,
      buttonPayload: true,
      createdAt: true,
    },
  });

  const conversationHistory = messages.reverse().map(msg => {
    if (msg.role === MessageRole.USER) {
      return new HumanMessage({
        content: msg.content as MessageContent,
        additional_kwargs: { createdAt: msg.createdAt, buttonPayload: msg.buttonPayload }
      });
    } else {
      return new AIMessage({
        content: msg.content as MessageContent,
        additional_kwargs: { createdAt: msg.createdAt }
      });
    }
  });

  const conversationHistoryLight = conversationHistory.map(msg => {
    let content: string;
    if (Array.isArray(msg.content)) {
      content = msg.content
        .map((part: any) => {
          if (part.type === 'image_url') {
            return '[IMAGE]';
          } else if (part.type === 'text') {
            return part.text;
          } else {
            return '';
          }
        })
        .join(' ');
    } else {
      content = msg.content as string;
    }

    if (msg instanceof HumanMessage) {
      return new HumanMessage({ content, additional_kwargs: msg.additional_kwargs });
    } else {
      return new AIMessage({ content, additional_kwargs: msg.additional_kwargs });
    }
  });

  return {
    ...state,
    conversationHistory,
    conversationHistoryLight,
    pending,
    user,
  };
}