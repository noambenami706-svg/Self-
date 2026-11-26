import { areJidsSameUser, isJidGroup, normalizeMessageContent, type WAMessage, type WASocket } from "baileys";

/** הטקסט של ההודעה (הודעה רגילה, הודעה עם ציטוט, או כיתוב של תמונה/קובץ). */
export function messageText(msg: WAMessage): string {
  const m = normalizeMessageContent(msg.message);
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.documentMessage?.caption ??
    m?.videoMessage?.caption ??
    ""
  ).trim();
}

/** האם זו הודעה שכתבתי בצ'אט "הודעה לעצמי". */
export function isSelfChat(sock: WASocket, msg: WAMessage): boolean {
  const jid = msg.key.remoteJid ?? undefined;
  if (!msg.key.fromMe || !jid || isJidGroup(jid)) return false;
  return areJidsSameUser(jid, sock.user?.id) || areJidsSameUser(jid, sock.user?.lid);
}

/** האם ההודעה הגיעה מאחת הקבוצות ברשימה הלבנה. */
export function isAllowedGroup(msg: WAMessage, allowedGroupIds: string[]): boolean {
  const jid = msg.key.remoteJid ?? "";
  return isJidGroup(jid) === true && allowedGroupIds.includes(jid);
}

/** מחזיר את הטקסט בלי הקידומת, או null אם ההודעה לא מתחילה בקידומת. */
export function stripPrefix(text: string, prefix: string): string | null {
  if (!text.startsWith(prefix)) return null;
  return text.slice(prefix.length).trim();
}
