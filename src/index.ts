import { count } from "drizzle-orm";
import { config } from "./config.js";
import { DB_PATH, db, migrateDb, schema } from "./db/index.js";

function status(ok: boolean, label: string, hint?: string) {
  console.log(`${ok ? "✅" : "⬜"} ${label}${!ok && hint ? `  ← ${hint}` : ""}`);
}

console.log("🤖 הסוכן האישי – בדיקת מצב\n");

migrateDb();
const [facts] = db.select({ n: count() }).from(schema.facts).all();
status(true, `מסד נתונים: ${DB_PATH} (${facts?.n ?? 0} עובדות שמורות)`);

status(!!config.ANTHROPIC_API_KEY, "Claude API", "הוסף ANTHROPIC_API_KEY ל-.env והרץ npm run check-claude");
status(config.WHATSAPP_GROUP_IDS.length > 0, `קבוצות ווטסאפ (${config.WHATSAPP_GROUP_IDS.length})`, "שלב 1/4");
status(!!config.MASHOV_USERNAME, "משו\"ב", "שלב 5");
status(!!config.SHAHAF_USERNAME, "שחף", "שלב 6");

console.log(`\nתדריך בוקר: ${config.MORNING_BRIEFING_TIME} (${config.TIMEZONE}) · קידומת: ${config.BOT_PREFIX}`);
console.log("שלב 0 הושלם. השלב הבא: חיבור ווטסאפ.");
