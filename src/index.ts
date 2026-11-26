import { count } from "drizzle-orm";
import type { WAMessage, WASocket } from "baileys";
import { config } from "./config.js";
import { DB_PATH, db, migrateDb, schema } from "./db/index.js";
import { connectWhatsApp } from "./whatsapp/client.js";
import { isAllowedGroup, isSelfChat, messageText, stripPrefix } from "./whatsapp/filter.js";

function status(ok: boolean, label: string, hint?: string) {
  console.log(`${ok ? "✅" : "⬜"} ${label}${!ok && hint ? `  ← ${hint}` : ""}`);
}

console.log("🤖 הסוכן האישי – בדיקת מצב\n");

await migrateDb();
const [facts] = await db.select({ n: count() }).from(schema.facts);
status(true, `מסד נתונים: ${DB_PATH} (${facts?.n ?? 0} עובדות שמורות)`);
status(!!config.ANTHROPIC_API_KEY, "Claude API", "הוסף ANTHROPIC_API_KEY ל-.env והרץ npm run check-claude");
status(config.WHATSAPP_GROUP_IDS.length > 0, `קבוצות ווטסאפ (${config.WHATSAPP_GROUP_IDS.length})`, "npm run list-groups");
status(!!config.MASHOV_USERNAME, "משו\"ב", "שלב 5");
status(!!config.SHAHAF_USERNAME, "שחף", "שלב 6");
console.log(`\nתדריך בוקר: ${config.MORNING_BRIEFING_TIME} (${config.TIMEZONE}) · קידומת: ${config.BOT_PREFIX}\n`);

const groupNames = new Map<string, string>();

async function groupName(sock: WASocket, jid: string): Promise<string | undefined> {
  if (!groupNames.has(jid)) {
    const meta = await sock.groupMetadata(jid).catch(() => undefined);
    if (meta) groupNames.set(jid, meta.subject);
  }
  return groupNames.get(jid);
}

async function handleSelfCommand(sock: WASocket, msg: WAMessage, command: string) {
  const reply = (text: string) => sock.sendMessage(msg.key.remoteJid!, { text });

  if (command === "פינג") return reply("פונג 🏓");
  if (!config.ANTHROPIC_API_KEY) {
    return reply("קיבלתי ✅ (Claude עוד לא מחובר, אז אני רק עונה ל: /בוט פינג)");
  }
  // שלב 1: כאן הסוכן (Claude + כלים) יענה
  return reply("קיבלתי ✅ (הסוכן עצמו מגיע בשלב הבא)");
}

async function storeGroupMessage(sock: WASocket, msg: WAMessage) {
  const text = messageText(msg);
  const jid = msg.key.remoteJid!;
  if (!text || !msg.key.id) return;
  await db
    .insert(schema.groupMessages)
    .values({
      waMessageId: msg.key.id,
      groupId: jid,
      groupName: await groupName(sock, jid),
      sender: msg.pushName ?? msg.key.participant ?? null,
      text,
      sentAt: new Date(Number(msg.messageTimestamp ?? 0) * 1000 || Date.now()).toISOString(),
    })
    .onConflictDoNothing();
  console.log(`💬 נשמרה הודעה מ"${groupNames.get(jid) ?? jid}"`);
}

await connectWhatsApp({
  async onMessage(sock, msg) {
    if (isSelfChat(sock, msg)) {
      const command = stripPrefix(messageText(msg), config.BOT_PREFIX);
      if (command !== null) await handleSelfCommand(sock, msg, command);
      return;
    }
    if (isAllowedGroup(msg, config.WHATSAPP_GROUP_IDS)) {
      await storeGroupMessage(sock, msg);
    }
    // כל שאר הצ'אטים והקבוצות: מתעלמים לגמרי, לא נשמר כלום.
  },
});
