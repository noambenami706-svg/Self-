import type Anthropic from "@anthropic-ai/sdk";
import { type WAMessage, downloadMediaMessage, normalizeMessageContent } from "baileys";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

type Attachment = Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock;

/** אם ההודעה מכילה תמונה או PDF – מוריד אותם ומחזיר בלוק שאפשר לשלוח ל-Claude. */
export async function extractAttachment(msg: WAMessage): Promise<Attachment | { error: string } | undefined> {
  const m = normalizeMessageContent(msg.message);
  const image = m?.imageMessage;
  const doc = m?.documentMessage ?? m?.documentWithCaptionMessage?.message?.documentMessage;
  const mime = (image?.mimetype ?? doc?.mimetype ?? "").split(";")[0]!.trim();
  if (!image && !doc) return undefined;

  if (!IMAGE_TYPES.has(mime) && mime !== "application/pdf") {
    return { error: `סוג קובץ שאני עוד לא קורא (${mime || "לא ידוע"}). שלח PDF או תמונה.` };
  }

  const buffer = await downloadMediaMessage(msg, "buffer", {});
  if (buffer.length > MAX_BYTES) return { error: "הקובץ גדול מדי (מעל 20MB)." };
  const data = buffer.toString("base64");

  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data },
  };
}
