import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { buildSearchDoc, buildKeywords, Item } from "../utils/wardrobe";
import { getEmbedding, generateJson } from "../utils/openai";

const WARDROBE_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "..", "wardrobe_prompt.txt"),
  "utf-8",
);
const WARDROBE_MODEL = process.env.OPENAI_WARDROBE_INDEXING_MODEL || "gpt-5";

export type IndexWardrobePayload = {
  userId: string;
  messageId: string;
};

export type IndexWardrobeResult = {
  message: string;
};

export const indexWardrobeHandler = async (
  prisma: PrismaClient,
  payload: IndexWardrobePayload,
): Promise<IndexWardrobeResult> => {
  const { userId, messageId } = payload;
  console.info({ message: "Starting wardrobe indexing", payload });

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { media: true },
  });

  if (!message?.media?.length) {
    console.debug({
      message: "No media to process for wardrobe indexing",
      payload,
    });
    return { message: "No media to process" };
  }

  console.debug({
    message: "Processing media for wardrobe indexing",
    mediaCount: message.media.length,
    payload,
  });
  let itemsCreated = 0;

  for (const media of message.media) {
    if (!media.mimeType.startsWith("image/")) continue;
    console.debug({
      message: "Processing media item",
      mediaId: media.id,
      payload,
    });

    const result = await generateJson<{ items: Item[] }>(WARDROBE_MODEL, [
      {
        role: "user",
        content: [
          { type: "input_text", text: WARDROBE_PROMPT },
          { type: "input_image", image_url: media.serverUrl, detail: "high" },
        ],
      },
    ]);

    for (const item of result.items || []) {
      const searchDoc = buildSearchDoc(item);
      const keywords = buildKeywords(item);
      const { embedding, model, dimensions } = await getEmbedding(searchDoc);

      const createdItem = await prisma.wardrobeItem.create({
        data: {
          userId,
          name: item.name,
          description: item.description,
          category: item.category,
          type: item.type,
          subtype: item.subtype,
          mainColor: item.mainColor,
          secondaryColor: item.secondaryColor,
          attributes: item.attributes,
          keywords,
          searchDoc,
          embeddingModel: model,
          embeddingDim: dimensions,
          embeddingAt: new Date(),
        },
      });

      await prisma.$executeRaw`UPDATE "WardrobeItem" SET embedding = ${embedding}::vector WHERE id = ${createdItem.id}`;
      itemsCreated++;
      console.debug({
        message: "Created wardrobe item",
        itemId: createdItem.id,
        payload,
      });
    }
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { wardrobeProcessed: true },
  });

  const result: IndexWardrobeResult = { message: `Created ${itemsCreated} wardrobe items` };
  console.info({
    message: "Wardrobe indexing finished",
    details: result.message,
    payload,
  });
  return result;
};
