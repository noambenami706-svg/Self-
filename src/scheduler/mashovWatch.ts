import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { getClaude, PARSER_MODEL } from "../llm/claude.js";
import { getMashov, mashovConfigured } from "../connectors/school/mashovService.js";

type Item = Record<string, unknown>;

const pick = (o: Item, ...keys: string[]) => {
  for (const k of keys) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
};
const str = (v: unknown) => (v == null ? null : String(v));

/** מזהה יציב לכל פריט: לפי שדה מזהה אם יש, אחרת לפי תוכן הפריט. */
function itemKey(o: Item): string {
  const id = pick(o, "gradingEventId", "id", "eventCode", "behaveId");
  const base = id != null ? `${id}|${pick(o, "lessonDate", "eventDate", "date") ?? ""}` : JSON.stringify(o);
  return createHash("sha1").update(base).digest("hex");
}

/** מנסח הודעה קצרה על פריטים חדשים בעזרת Haiku (ובלי Claude – הודעה כללית). */
async function describe(kind: "ציונים" | "התנהגות", items: Item[]): Promise<string> {
  if (!config.ANTHROPIC_API_KEY) return `📝 יש ${items.length} עדכוני ${kind} חדשים במשו"ב.`;
  const res = await getClaude().messages.create({
    model: PARSER_MODEL,
    max_tokens: 400,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content:
          `אלה ${kind} חדשים ממשו"ב של נועם (JSON). כתוב הודעת ווטסאפ קצרה בעברית: שורה לכל פריט עם מקצוע, מה קרה ותאריך. ` +
          `התחל ב-${kind === "ציונים" ? "📝" : "📋"}. בלי הקדמות.\n\n${JSON.stringify(items)}`,
      },
    ],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

async function syncGrades(): Promise<Item[]> {
  const data = (await getMashov().get("grades")) as Item[];
  if (!Array.isArray(data)) return [];
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(schema.grades);
  const firstRun = n === 0;
  const fresh: Item[] = [];
  for (const g of data) {
    const externalId = itemKey(g);
    const exists = await db.select({ id: schema.grades.id }).from(schema.grades).where(eq(schema.grades.externalId, externalId));
    if (exists.length) continue;
    const gradeVal = pick(g, "grade");
    await db.insert(schema.grades).values({
      externalId,
      subject: str(pick(g, "subjectName", "subject")) ?? "?",
      grade: typeof gradeVal === "number" ? gradeVal : Number.isFinite(Number(gradeVal)) ? Number(gradeVal) : null,
      gradeText: str(gradeVal),
      kind: str(pick(g, "gradeType", "gradingPeriod")),
      title: str(pick(g, "gradingEvent", "eventName", "title")),
      date: str(pick(g, "eventDate", "date")),
      notified: firstRun, // בפעם הראשונה לא שולחים את כל הציונים הישנים
    });
    if (!firstRun) fresh.push(g);
  }
  return fresh;
}

async function syncBehavior(): Promise<Item[]> {
  const data = (await getMashov().get("behave")) as Item[];
  if (!Array.isArray(data)) return [];
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(schema.behavior);
  const firstRun = n === 0;
  const fresh: Item[] = [];
  for (const b of data) {
    const externalId = itemKey(b);
    const exists = await db.select({ id: schema.behavior.id }).from(schema.behavior).where(eq(schema.behavior.externalId, externalId));
    if (exists.length) continue;
    const lesson = pick(b, "lesson");
    await db.insert(schema.behavior).values({
      externalId,
      date: str(pick(b, "lessonDate", "date")) ?? "",
      lesson: Number.isFinite(Number(lesson)) ? Number(lesson) : null,
      subject: str(pick(b, "subject", "subjectName")),
      teacher: str(pick(b, "reporter", "teacherName")),
      kind: str(pick(b, "achvaName", "eventType", "type")) ?? "?",
      notified: firstRun,
    });
    if (!firstRun) fresh.push(b);
  }
  return fresh;
}

/** בודק פעם אחת אם יש ציונים או התנהגויות חדשים, ושולח הודעה אם כן. */
export async function checkMashovOnce(send: (text: string) => Promise<void>): Promise<void> {
  if (!mashovConfigured()) return;
  const grades = await syncGrades();
  if (grades.length) await send(await describe("ציונים", grades));
  const behave = await syncBehavior();
  if (behave.length) await send(await describe("התנהגות", behave));
}

let started = false;

/** מפעיל בדיקה כל 30 דקות בין 07:00 ל-22:00 (פעם אחת, גם אם ווטסאפ מתחבר מחדש). */
export function startMashovWatch(send: (text: string) => Promise<void>): void {
  if (started || !mashovConfigured()) return;
  started = true;
  const tick = async () => {
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE, hour: "numeric", hour12: false }));
    if (hour < 7 || hour >= 22) return;
    try {
      await checkMashovOnce(send);
    } catch (err) {
      console.error('משו"ב: בדיקה נכשלה –', err instanceof Error ? err.message : err);
    }
  };
  void tick();
  setInterval(() => void tick(), 30 * 60 * 1000);
  console.log('📚 משו"ב: בודק ציונים והתנהגויות כל 30 דקות');
}
