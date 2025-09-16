import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import { extension as extFromMime } from "mime-types";

import { BadRequestError, InternalServerError } from "./errors";
import { logger } from "./logger";
import { ensureDir, userUploadDir } from "./paths";

const twilioAuth = {
  sid: process.env.TWILIO_ACCOUNT_SID || "",
  token: process.env.TWILIO_AUTH_TOKEN || "",
};

/**
 * Downloads media from Twilio and saves it locally
 * @param url - Twilio media URL
 * @param whatsappId - WhatsApp ID for user directory
 * @param mimeType - MIME type (e.g., 'image/jpeg')
 * @returns Public URL to the downloaded file
 */
export async function downloadTwilioMedia(
  url: string,
  whatsappId: string,
  mimeType: string,
): Promise<string> {
  if (!twilioAuth.sid || !twilioAuth.token) {
    throw new InternalServerError("Twilio credentials missing");
  }
  if (!mimeType) {
    throw new BadRequestError("MIME type is required");
  }
  try {
    const extension = extFromMime(mimeType);
    const filename = `twilio_${randomUUID()}${extension ? `.${extension}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioAuth.sid}:${twilioAuth.token}`).toString("base64")}`,
      },
    });

    if (!response.ok) {
      throw new InternalServerError(
        `Failed to download media: ${response.status}`,
      );
    }

    const uploadDir = userUploadDir(whatsappId);
    await ensureDir(uploadDir);
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    const baseUrl = process.env.SERVER_URL?.replace(/\/$/, "") || "";
    const publicUrl = `${baseUrl}/uploads/${whatsappId}/${filename}`;
    logger.debug(
      { whatsappId, filename, filePath, mimeType, size: buffer.length },
      "Twilio media downloaded and saved",
    );

    return publicUrl;
  } catch (err: unknown) {
    throw new InternalServerError("Failed to download Twilio media", {
      cause: err,
    });
  }
}
