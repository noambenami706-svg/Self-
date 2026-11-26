import { type WAMessage, isJidGroup, jidNormalizedUser, normalizeMessageContent } from "baileys";
import { config } from "../config.js";
import { messageText, type WhatsApp } from "./client.js";
import { allowedGroups } from "./groups.js";

export type Incoming =
  | { kind: "command"; text: string; chatJid: string; msg: WAMessage }
  | { kind: "group"; groupId: string; groupName: string; text: string; msg: WAMessage }
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

  // קבוצת הבוט ("יודע הכל"): כל הודעה שלי היא פקודה, הקידומת לא חובה
  if (wa.botGroupId && key.remoteJid === wa.botGroupId) {
    if (!key.fromMe) return { kind: "ignore" };
    const m = normalizeMessageContent(msg.message);
    const hasMedia = !!(m?.imageMessage || m?.documentMessage || m?.documentWithCaptionMessage);
    if (!text && !hasMedia) return { kind: "ignore" };
    const stripped = text.startsWith(config.BOT_PREFIX) ? text.slice(config.BOT_PREFIX.length).trim() : text;
    return { kind: "command", text: stripped, chatJid: key.remoteJid, msg };
  }

  // קבוצה מורשית
  if (isJidGroup(key.remoteJid)) {
    if (!allowedGroups.has(key.remoteJid) || !text) return { kind: "ignore" };
    return { kind: "group", groupId: key.remoteJid, groupName: allowedGroups.get(key.remoteJid) ?? "", text, msg };
  }

  // הודעה לעצמי
  const chat = [key.remoteJid, key.remoteJidAlt]
    .filter((j): j is string => !!j)
    .map((j) => jidNormalizedUser(j));
  const isSelfChat = key.fromMe && chat.some((j) => wa.selfJids.has(j));
  if (isSelfChat && text.startsWith(config.BOT_PREFIX)) {
    return { kind: "command", text: text.slice(config.BOT_PREFIX.length).trim(), chatJid: key.remoteJid, msg };
  }

  return { kind: "ignore" };
}
