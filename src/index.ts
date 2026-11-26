import { count } from "drizzle-orm";
import { config } from "./config.js";
import { DB_PATH, db, migrateDb, schema } from "./db/index.js";
import { startWhatsApp } from "./whatsapp/client.js";
import { classify } from "./whatsapp/filter.js";
import { allowedGroups, resolveAllowedGroups } from "./whatsapp/groups.js";

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
status(!!config.MASHOV_USERNAME, "משו\"ב", "שלב 5");
status(!!config.SHAHAF_USERNAME, "שחף", "שלב 6");
console.log(`\nתדריך בוקר: ${config.MORNING_BRIEFING_TIME} · קידומת: ${config.BOT_PREFIX}\n`);

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
      console.log(`💬 קיבלתי: ${incoming.text}`);
      // שלב 1: Claude עוד לא מחובר – רק מאשרים שהחיבור עובד.
      const reply = config.ANTHROPIC_API_KEY
        ? `✅ קיבלתי: "${incoming.text}". הסוכן החכם יחובר בשלב הבא.`
        : `✅ הבוט מחובר ושומע אותך. Claude יחובר אחרי שיתווסף מפתח API.`;
      await wa.sendToSelf(reply);
    }
  },
  async onReady(wa) {
    const { missing } = await resolveAllowedGroups(wa);
    console.log(`👥 הבוט קורא ${allowedGroups.size} קבוצות. לרשימה: notepad data\\active-groups.txt`);
    if (missing.length) console.log(`⚠️ ${missing.length} שמות קבוצות לא נמצאו (ראה ברשימה)`);
    console.log(`כתוב בווטסאפ בצ'אט "הודעה לעצמי": ${config.BOT_PREFIX} שלום`);
  },
});
