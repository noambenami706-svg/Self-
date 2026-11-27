import Anthropic from "@anthropic-ai/sdk";
import { count } from "drizzle-orm";
import { runAgent } from "./agent/agent.js";
import { config } from "./config.js";
import { DB_PATH, db, migrateDb, schema } from "./db/index.js";
import { startWhatsApp, type WhatsApp } from "./whatsapp/client.js";
import { classify } from "./whatsapp/filter.js";
import { allowedGroups, resolveAllowedGroups } from "./whatsapp/groups.js";
import { extractAttachment } from "./whatsapp/media.js";
import { mashovConfigured } from "./connectors/school/mashovService.js";
import { googleConfigured } from "./connectors/google/calendar.js";
import { startMashovWatch } from "./scheduler/mashovWatch.js";
import { sendBriefingNow, startDailyScheduler } from "./scheduler/daily.js";

function status(ok: boolean, label: string, hint?: string) {
  console.log(`${ok ? "✅" : "⬜"} ${label}${!ok && hint ? `  ← ${hint}` : ""}`);
}

console.log("🤖 הסוכן האישי\n");

await migrateDb();
const [facts] = await db.select({ n: count() }).from(schema.facts);
status(true, `מסד נתונים: ${DB_PATH} (${facts?.n ?? 0} עובדות שמורות)`);
status(!!config.ANTHROPIC_API_KEY, "Claude API", "הוסף ANTHROPIC_API_KEY ל-.env והרץ npm run check-claude");
const groupCount = config.WHATSAPP_GROUP_IDS.length + config.WHATSAPP_GROUP_NAMES.length;
status(groupCount > 0, `קבוצות ווטסאפ (${groupCount})`, "npm run list-groups");
status(mashovConfigured(), "משו\"ב", "npm run set-mashov");
status(!!config.SHAHAF_USERNAME, "שחף", "צריך פרטי כניסה מבית הספר");
status(googleConfigured(), "יומן גוגל", "npm run google-auth");
console.log(`\nתדריך בוקר: ${config.MORNING_BRIEFING_TIME} · קידומת: ${config.BOT_PREFIX}\n`);

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "❌ מפתח ה-API לא תקין. בדוק אותו בקובץ .env";
  if (err instanceof Anthropic.PermissionDeniedError) return "❌ אין קרדיט בחשבון Claude (Billing ב-console.anthropic.com)";
  if (err instanceof Anthropic.RateLimitError) return "⏳ יותר מדי בקשות, נסה שוב בעוד דקה";
  if (err instanceof Anthropic.APIConnectionError) return "📡 אין חיבור ל-Claude כרגע, נסה שוב";
  return "❌ משהו השתבש. נסה שוב, ואם זה חוזר תסתכל בחלון של הבוט במחשב.";
}

/** החיבור הפעיל לווטסאפ (מתעדכן אחרי התחברות מחדש), להודעות יזומות. */
let currentWa: WhatsApp | undefined;

const startedAt = Math.floor(Date.now() / 1000) - 60;

await startWhatsApp({
  async onMessage(msg, wa) {
    // לא לטפל בהודעות ישנות שמגיעות בסנכרון אחרי התחברות
    if (Number(msg.messageTimestamp ?? 0) < startedAt) return;

    const incoming = classify(msg, wa);

    if (incoming.kind === "group") {
      await db
        .insert(schema.groupMessages)
        .values({
          waMessageId: msg.key.id ?? `${incoming.groupId}:${msg.messageTimestamp}`,
          groupId: incoming.groupId,
          groupName: incoming.groupName,
          sender: msg.pushName ?? null,
          text: incoming.text,
          sentAt: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
        })
        .onConflictDoNothing();
      console.log(`📥 נשמרה הודעה מקבוצה (${incoming.text.slice(0, 40)}...)`);
      return;
    }

    if (incoming.kind === "command") {
      console.log(`💬 ${incoming.text}`);
      if (!config.ANTHROPIC_API_KEY) {
        await wa.sendTo(incoming.chatJid, "✅ הבוט מחובר ושומע אותך. Claude יחובר אחרי שיתווסף מפתח API.");
        return;
      }
      try {
        // "תדריך" – שולח את תדריך הבוקר עכשיו
        if (/^(תדריך|תדריך בוקר)$/.test(incoming.text.trim())) {
          await wa.sock.sendPresenceUpdate("composing", incoming.chatJid);
          await sendBriefingNow((t) => wa.sendTo(incoming.chatJid, t));
          return;
        }
        const attachment = await extractAttachment(incoming.msg);
        if (attachment && "error" in attachment) {
          await wa.sendTo(incoming.chatJid, attachment.error);
          return;
        }
        await wa.sock.sendPresenceUpdate("composing", incoming.chatJid);
        const reply = await runAgent(incoming.text, attachment);
        await wa.sendTo(incoming.chatJid, reply);
      } catch (err) {
        console.error("שגיאה בסוכן:", err);
        await wa.sendTo(incoming.chatJid, friendlyError(err));
      }
    }
  },
  async onReady(wa) {
    const { missing } = await resolveAllowedGroups(wa);
    console.log(`👥 הבוט קורא ${allowedGroups.size} קבוצות. לרשימה: notepad data\\active-groups.txt`);
    if (missing.length) console.log(`⚠️ ${missing.length} שמות קבוצות לא נמצאו (ראה ברשימה)`);
    currentWa = wa;
    const sendToMe = (text: string) => (currentWa ? currentWa.sendToMe(text) : Promise.resolve());
    startMashovWatch(sendToMe);
    startDailyScheduler(sendToMe);
    if (wa.botGroupId) console.log(`🤖 קבוצת הבוט נמצאה. כתוב שם כל הודעה.`);
    else console.log(`כתוב בווטסאפ בצ'אט "הודעה לעצמי": ${config.BOT_PREFIX} שלום`);
  },
});
