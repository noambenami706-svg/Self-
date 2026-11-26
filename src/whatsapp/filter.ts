import { type WAMessage, isJidGroup, jidNormalizedUser } from "baileys";
import { config } from "../config.js";
import { messageText, type WhatsApp } from "./client.js";

export type Incoming =
  | { kind: "command"; text: string; msg: WAMessage }
  | { kind: "group"; groupId: string; text: string; msg: WAMessage }
  | { kind: "ignore" };

/**
 * מחליט מה לעשות עם הודעה:
 * - "הודעה לעצמי" שמתחילה בקידומת (/בוט) → פקודה לבוט
 * - הודעה בקבוצה שברשימה הלבנה → נשמרת לניתוח
 * - כל השאר → נזרק מיד, בלי לשמור ובלי לשלוח לשום מקום
 */
export function classify(msg: WAMessage, wa: WhatsApp): Incoming {
  const key = msg.key;
  if (!key.remoteJid || !msg.message) return { kind: "ignore" };
  if (key.id && wa.sentByBot.has(key.id)) return { kind: "ignore" };

  const text = messageText(msg);

  // קבוצה מורשית
  if (isJidGroup(key.remoteJid)) {
    if (!config.WHATSAPP_GROUP_IDS.includes(key.remoteJid) || !text) return { kind: "ignore" };
    return { kind: "group", groupId: key.remoteJid, text, msg };
  }

  // הודעה לעצמי
  const chat = [key.remoteJid, key.remoteJidAlt]
    .filter((j): j is string => !!j)
    .map((j) => jidNormalizedUser(j));
  const isSelfChat = key.fromMe && chat.some((j) => wa.selfJids.has(j));
  if (isSelfChat && text.startsWith(config.BOT_PREFIX)) {
    return { kind: "command", text: text.slice(config.BOT_PREFIX.length).trim(), msg };
  }

  return { kind: "ignore" };
}
