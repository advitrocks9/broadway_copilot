import { PrismaClient, Message, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getEmbedding, generateJson, isTextContentPart } from '../utils/openai';

const MEMORY_EXTRACTION_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', '..', 'memories_prompt.txt'),
  'utf-8'
);
const MEMORY_EXTRACTION_MODEL = process.env.OPENAI_MEMORY_EXTRACTION_MODEL || 'gpt-4.1';

export type StoreMemoriesPayload = {
  userId: string;
  conversationId: string;
};

export type StoreMemoriesResult = {
  message: string;
};

type Memory = { memory: string };
type MessageContent = Pick<Message, 'role' | 'content'>;

const formatMessageContent = (content: Prisma.JsonValue[]): string => {
  const textParts = content
    .filter(isTextContentPart)
    .map((part) => part.text.trim());
  
  return textParts.join(' ') || '';
};

const extractMemories = async (messages: MessageContent[]): Promise<Memory[]> => {
  const formattedMessages = messages
    .filter((m) => m.role === 'USER' || m.role === 'AI')
    .map((m) => ({
      role: m.role === 'USER' ? 'user' as const : 'assistant' as const,
      text: formatMessageContent(m.content),
    }))
    .filter((m) => m.text.length > 0);

  if (formattedMessages.length === 0) return [];

  const result = await generateJson<Memory[]>(MEMORY_EXTRACTION_MODEL, [
    {
      role: 'system',
      content: [{ type: 'input_text', text: MEMORY_EXTRACTION_PROMPT }],
    },
    {
      role: 'user',
      content: [{ type: 'input_text', text: JSON.stringify(formattedMessages) }],
    },
  ]);

  return result.filter((m): m is Memory => 
    typeof m.memory === 'string' && m.memory.length > 0
  );
};

const saveMemories = async (
  prisma: PrismaClient,
  userId: string,
  memories: Memory[]
) => {
  await Promise.all(memories.map(async (memory) => {
    const { embedding, model, dimensions } = await getEmbedding(memory.memory);

    const createdMemory = await prisma.memory.create({
      data: {
        userId,
        memory: memory.memory,
        embeddingModel: model,
        embeddingDim: dimensions,
        embeddingAt: new Date(),
      },
    });

    await prisma.$executeRaw`UPDATE "Memory" SET embedding = ${embedding}::vector WHERE id = ${createdMemory.id}`;
  }));
};

const markProcessed = async (prisma: PrismaClient, messageIds: string[]) => {
  if (messageIds.length === 0) return;
  
  await prisma.message.updateMany({
    where: { id: { in: messageIds } },
    data: { memoriesProcessed: true },
  });
};

export const storeMemoriesHandler = async (
  prisma: PrismaClient,
  payload: StoreMemoriesPayload
): Promise<StoreMemoriesResult> => {
  const { userId, conversationId } = payload;

  const messages = await prisma.message.findMany({
    where: { conversationId, memoriesProcessed: false },
    orderBy: { createdAt: 'asc' },
  });

  if (messages.length === 0) {
    return { message: 'No new messages to process' };
  }

  const memories = await extractMemories(messages);
  
  if (memories.length > 0) {
    await saveMemories(prisma, userId, memories);
  }

  await markProcessed(prisma, messages.map(m => m.id));

  return { 
    message: `Processed ${messages.length} messages, extracted ${memories.length} memories` 
  };
};
