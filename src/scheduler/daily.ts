import { and, eq, lte } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { runAgent } from "../agent/agent.js";

type Send = (text: string) => Promise<void>;

function israelNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}`, weekday: get("weekday") };
}

const BRIEFING_PROMPT = `[משימה אוטומטית – תדריך בוקר] כתוב לנועם תדריך בוקר קצר להיום. לפני שאתה כותב, תבדוק עם הכלים:
1. מערכת השעות של היום (get_timetable) – רק בימים א'-ה'. ציין אם צריך נעלי ספורט, ותבדוק בקבוצה "מגמת חינוך גופני" ובקבוצות בית הספר (get_group_messages, 2 ימים אחורה) אם יש ביטולים או שינויים.
2. היומן של היום (calendar_list_events).
3. צופים: פעולה בשלישי/שישי; הגשת פעולה – ביום ראשון (לשלישי) וביום רביעי (לשישי). בדוק עדכונים ב"עדכוני שכבג" ובקבוצת הצוות.
4. אימון היום לפי תוכנית האימונים (אם התוכנית התחילה), ותזכורות ותשלומים פתוחים (list_reminders).
מבנה: שורת פתיחה עם היום והתאריך, ואחריה שורה קצרה לכל נושא שיש בו משהו, עם אימוג'י בתחילת השורה. נושא בלי כלום – לא לכתוב. בלי הקדמות ובלי סיכום.`;

let lastBriefingDate = "";
let started = false;

/** תדריך בוקר + שליחת תזכורות שהגיע זמנן. בודק כל 30 שניות. */
export function startDailyScheduler(send: Send): void {
  if (started) return;
  started = true;

  const tick = async () => {
    // תזכורות
    const due = await db
      .select()
      .from(schema.reminders)
      .where(and(eq(schema.reminders.sent, false), lte(schema.reminders.remindAt, new Date().toISOString())));
    for (const r of due) {
      try {
        await send(`⏰ ${r.text}`);
        await db.update(schema.reminders).set({ sent: true }).where(eq(schema.reminders.id, r.id));
      } catch (err) {
        console.error("תזכורת נכשלה:", err);
      }
    }

    // תדריך בוקר
    const now = israelNow();
    if (now.time >= config.MORNING_BRIEFING_TIME && now.time < "12:00" && lastBriefingDate !== now.date) {
      lastBriefingDate = now.date;
      if (!config.ANTHROPIC_API_KEY) return;
      try {
        console.log("🌅 שולח תדריך בוקר...");
        await send(await runAgent(BRIEFING_PROMPT, undefined, { savedAs: "[תדריך בוקר אוטומטי]", effort: "medium" }));
      } catch (err) {
        console.error("תדריך בוקר נכשל:", err);
      }
    }
  };

  // אם הבוט עלה אחרי שעת התדריך – לא שולחים היום (רק ממחר)
  const now = israelNow();
  if (now.time >= config.MORNING_BRIEFING_TIME) lastBriefingDate = now.date;

  setInterval(() => void tick().catch((e) => console.error(e)), 30_000);
  void tick().catch((e) => console.error(e));
  console.log(`🌅 תדריך בוקר כל יום ב-${config.MORNING_BRIEFING_TIME} · ⏰ תזכורות פעילות`);
}

/** שולח תדריך עכשיו (לבדיקה, או כשנועם מבקש). */
export async function sendBriefingNow(send: Send): Promise<void> {
  await send(await runAgent(BRIEFING_PROMPT, undefined, { savedAs: "[תדריך בוקר לפי בקשה]", effort: "medium" }));
}
