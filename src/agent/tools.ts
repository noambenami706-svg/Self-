import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, asc, desc, eq, gte, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { allowedGroups } from "../whatsapp/groups.js";
import { MASHOV_ENDPOINTS } from "../connectors/school/mashov.js";
import { createBotEvent, deleteBotEvent, googleConfigured, listEvents } from "../connectors/google/calendar.js";
import { getMashov, mashovConfigured, trimForModel } from "../connectors/school/mashovService.js";

const json = (v: unknown) => JSON.stringify(v, null, 1);

// ---------- זיכרון ----------

const getFacts = betaZodTool({
  name: "get_facts",
  description: "מחזיר את כל העובדות השמורות על נועם (מפתח → ערך).",
  inputSchema: z.object({}),
  run: async () => {
    const rows = await db.select().from(schema.facts).orderBy(asc(schema.facts.key));
    return rows.length ? json(Object.fromEntries(rows.map((r) => [r.key, r.value]))) : "אין עובדות שמורות עדיין.";
  },
});

const rememberFact = betaZodTool({
  name: "remember_fact",
  description: "שומר או מעדכן עובדה על נועם. מפתח קצר בעברית (למשל 'כיתה', 'אימון_נוכחי'), ערך חופשי.",
  inputSchema: z.object({ key: z.string().min(1), value: z.string().min(1) }),
  run: async ({ key, value }) => {
    await db
      .insert(schema.facts)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.facts.key, set: { value, updatedAt: sql`(datetime('now'))` } });
    return `נשמר: ${key}`;
  },
});

const forgetFact = betaZodTool({
  name: "forget_fact",
  description: "מוחק עובדה לפי מפתח.",
  inputSchema: z.object({ key: z.string().min(1) }),
  run: async ({ key }) => {
    const res = await db.delete(schema.facts).where(eq(schema.facts.key, key));
    return res.rowsAffected ? `נמחק: ${key}` : `לא נמצא מפתח: ${key}`;
  },
});

// ---------- קבוצות ----------

const listGroups = betaZodTool({
  name: "list_groups",
  description: "רשימת קבוצות הווטסאפ שנועם אישר לבוט לקרוא.",
  inputSchema: z.object({}),
  run: async () => json([...allowedGroups.values()]),
});

const getGroupMessages = betaZodTool({
  name: "get_group_messages",
  description:
    "הודעות אחרונות מהקבוצות המורשות, מהחדשה לישנה. אפשר לסנן לפי חלק משם הקבוצה ולפי מילה בטקסט. " +
    "הבוט שומר רק הודעות שהגיעו מאז שהוא רץ.",
  inputSchema: z.object({
    group: z.string().optional().describe("חלק משם הקבוצה, למשל 'צופים' או 'ספרות'"),
    query: z.string().optional().describe("מילה שחייבת להופיע בהודעה"),
    days: z.number().int().min(1).max(30).optional().describe("כמה ימים אחורה (ברירת מחדל 7)"),
  }),
  run: async ({ group, query, days }) => {
    const since = new Date(Date.now() - (days ?? 7) * 86_400_000).toISOString();
    const conds = [gte(schema.groupMessages.sentAt, since)];
    if (group) conds.push(like(schema.groupMessages.groupName, `%${group}%`));
    if (query) conds.push(like(schema.groupMessages.text, `%${query}%`));
    const rows = await db
      .select()
      .from(schema.groupMessages)
      .where(and(...conds))
      .orderBy(desc(schema.groupMessages.sentAt))
      .limit(80);
    if (!rows.length) return "אין הודעות שמורות שמתאימות לחיפוש.";
    return rows
      .map((r) => {
        const t = new Date(r.sentAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
        return `[${t}] ${r.groupName ?? ""} | ${r.sender ?? ""}: ${r.text}`;
      })
      .join("\n");
  },
});

// ---------- אימונים ----------

const exerciseSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().optional(),
  reps: z.string().optional().describe("למשל '12', '8-10', '30 שניות'"),
  rest_seconds: z.number().int().optional(),
  notes: z.string().optional(),
});

const getWorkoutPlan = betaZodTool({
  name: "get_workout_plan",
  description: "מחזיר את תוכנית האימונים (כל הימים, או יום אחד).",
  inputSchema: z.object({ day: z.string().optional().describe("שם היום כמו שנשמר, למשל 'שלישי' או 'A'") }),
  run: async ({ day }) => {
    const rows = await db
      .select()
      .from(schema.workoutPlan)
      .where(day ? eq(schema.workoutPlan.day, day) : undefined)
      .orderBy(asc(schema.workoutPlan.day), asc(schema.workoutPlan.order));
    if (!rows.length) return day ? `אין אימון שמור ליום '${day}'.` : "אין תוכנית אימונים שמורה עדיין.";
    const byDay: Record<string, unknown[]> = {};
    for (const r of rows) {
      (byDay[r.day] ??= []).push({ exercise: r.exercise, sets: r.sets, reps: r.reps, rest_seconds: r.restSeconds, notes: r.notes });
    }
    return json(byDay);
  },
});

const setWorkoutDay = betaZodTool({
  name: "set_workout_day",
  description: "מחליף את כל התרגילים של יום אימון אחד (לפי הסדר). משמש גם לשמירת תוכנית חדשה וגם לשינויים.",
  inputSchema: z.object({ day: z.string().min(1), exercises: z.array(exerciseSchema).min(1) }),
  run: async ({ day, exercises }) => {
    await db.transaction(async (tx) => {
      await tx.delete(schema.workoutPlan).where(eq(schema.workoutPlan.day, day));
      await tx.insert(schema.workoutPlan).values(
        exercises.map((e, i) => ({
          day,
          order: i + 1,
          exercise: e.exercise,
          sets: e.sets ?? null,
          reps: e.reps ?? null,
          restSeconds: e.rest_seconds ?? null,
          notes: e.notes ?? null,
        })),
      );
    });
    return `נשמרו ${exercises.length} תרגילים ליום '${day}'.`;
  },
});

const deleteWorkoutDay = betaZodTool({
  name: "delete_workout_day",
  description: "מוחק יום אימון שלם.",
  inputSchema: z.object({ day: z.string().min(1) }),
  run: async ({ day }) => {
    const res = await db.delete(schema.workoutPlan).where(eq(schema.workoutPlan.day, day));
    return res.rowsAffected ? `נמחק יום '${day}'.` : `לא נמצא יום '${day}'.`;
  },
});

// ---------- תזונה ----------

const mealSchema = z.object({
  day: z.string().optional().describe("ריק = כל יום"),
  meal: z.string().describe("בוקר / ביניים / צהריים / ערב ..."),
  time: z.string().optional().describe("HH:MM"),
  description: z.string(),
});

const getNutritionPlan = betaZodTool({
  name: "get_nutrition_plan",
  description: "מחזיר את תוכנית התזונה השמורה.",
  inputSchema: z.object({}),
  run: async () => {
    const rows = await db.select().from(schema.nutritionPlan).orderBy(asc(schema.nutritionPlan.time));
    return rows.length ? json(rows.map(({ id: _id, ...r }) => r)) : "אין תוכנית תזונה שמורה עדיין.";
  },
});

const setNutritionPlan = betaZodTool({
  name: "set_nutrition_plan",
  description: "מחליף את כל תוכנית התזונה. לשינוי קטן: קרא קודם את התוכנית ושלח אותה מלאה עם השינוי.",
  inputSchema: z.object({ meals: z.array(mealSchema).min(1) }),
  run: async ({ meals }) => {
    await db.transaction(async (tx) => {
      await tx.delete(schema.nutritionPlan);
      await tx.insert(schema.nutritionPlan).values(
        meals.map((m) => ({ day: m.day ?? null, meal: m.meal, time: m.time ?? null, description: m.description })),
      );
    });
    return `נשמרו ${meals.length} ארוחות.`;
  },
});

// ---------- מערכת שעות ----------

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

const lessonSchema = z.object({
  lesson: z.number().int().min(0).max(12),
  start: z.string().optional().describe("HH:MM"),
  end: z.string().optional().describe("HH:MM"),
  subject: z.string(),
  code: z.string().optional().describe("המספר בסוגריים המרובעים, למשל 15488"),
  teacher: z.string().optional(),
  room: z.string().optional(),
  needs_sports_shoes: z.boolean().describe("true רק לשיעור מעשי של ספורט (לפי הכללים בהנחיות)"),
});

const getTimetable = betaZodTool({
  name: "get_timetable",
  description: "המערכת הקבועה של נועם (בלי ביטולים). יום אחד או כל השבוע.",
  inputSchema: z.object({ day: z.enum(DAYS).optional() }),
  run: async ({ day }) => {
    const rows = await db
      .select()
      .from(schema.timetable)
      .where(day ? eq(schema.timetable.dayOfWeek, DAYS.indexOf(day)) : undefined)
      .orderBy(asc(schema.timetable.dayOfWeek), asc(schema.timetable.lesson));
    if (!rows.length) return "אין מערכת שעות שמורה עדיין.";
    return rows
      .map(
        (r) =>
          `${DAYS[r.dayOfWeek]} ${r.lesson}. ${r.startTime ?? ""}-${r.endTime ?? ""} ${r.subject}` +
          `${r.code ? ` [${r.code}]` : ""}${r.teacher ? ` | ${r.teacher}` : ""}${r.room ? ` | ${r.room}` : ""}` +
          `${r.isSports ? " | 👟 נעלי ספורט" : ""}`,
      )
      .join("\n");
  },
});

const setTimetableDay = betaZodTool({
  name: "set_timetable_day",
  description: "מחליף את המערכת הקבועה של יום אחד (למשל מצילום מסך של משו\"ב).",
  inputSchema: z.object({ day: z.enum(DAYS), lessons: z.array(lessonSchema) }),
  run: async ({ day, lessons }) => {
    const dow = DAYS.indexOf(day);
    await db.transaction(async (tx) => {
      await tx.delete(schema.timetable).where(eq(schema.timetable.dayOfWeek, dow));
      if (lessons.length) {
        await tx.insert(schema.timetable).values(
          lessons.map((l) => ({
            source: "mashov" as const,
            dayOfWeek: dow,
            lesson: l.lesson,
            startTime: l.start ?? null,
            endTime: l.end ?? null,
            subject: l.subject,
            code: l.code ?? null,
            teacher: l.teacher ?? null,
            room: l.room ?? null,
            isSports: l.needs_sports_shoes,
          })),
        );
      }
    });
    return `נשמרו ${lessons.length} שיעורים ליום ${day}.`;
  },
});

// ---------- משו"ב ----------

const mashovGet = betaZodTool({
  name: "mashov_get",
  description:
    'קורא נתונים עדכניים ממשו"ב (JSON גולמי, הפריטים האחרונים). ' +
    "grades = ציונים, behave = התנהגויות (חיסורים, איחורים, הערות), homework = שיעורי בית, " +
    "timetable = מערכת, bells = שעות הצלצולים, groups = הקבוצות/מקצועות שלו, lessonsCount = ספירת שיעורים.",
  inputSchema: z.object({ what: z.enum(MASHOV_ENDPOINTS) }),
  run: async ({ what }) => {
    if (!mashovConfigured()) return 'משו"ב עוד לא מחובר (צריך להריץ במחשב: npm run set-mashov).';
    try {
      return trimForModel(await getMashov().get(what));
    } catch (err) {
      return `שגיאה בקריאה ממשו"ב: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

// ---------- יומן גוגל ----------

const NOT_CONNECTED = "יומן גוגל עוד לא מחובר (צריך להריץ במחשב: npm run google-auth).";
const errText = (err: unknown) => `שגיאה ביומן גוגל: ${err instanceof Error ? err.message : String(err)}`;

const calendarListEvents = betaZodTool({
  name: "calendar_list_events",
  description: "אירועים מיומן גוגל של נועם (כל היומנים המוצגים), מתאריך מסוים לכמה ימים.",
  inputSchema: z.object({
    from: z.string().optional().describe("YYYY-MM-DD, ברירת מחדל היום"),
    days: z.number().int().min(1).max(31).optional().describe("ברירת מחדל 1"),
  }),
  run: async ({ from, days }) => {
    if (!googleConfigured()) return NOT_CONNECTED;
    try {
      const start = from ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
      const fromIso = new Date(`${start}T00:00:00+02:00`).toISOString();
      const toIso = new Date(Date.parse(fromIso) + (days ?? 1) * 86_400_000).toISOString();
      const events = await listEvents(fromIso, toIso);
      if (!events.length) return "אין אירועים בטווח הזה.";
      return events
        .map((e) => {
          const when = e.allDay
            ? `${e.start} (כל היום)`
            : new Date(e.start).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
          return `${when} | ${e.title}${e.location ? ` | ${e.location}` : ""} | יומן: ${e.calendar}${e.fromBot ? ` | id=${e.id}` : ""}`;
        })
        .join("\n");
    } catch (err) {
      return errText(err);
    }
  },
});

const calendarCreateEvent = betaZodTool({
  name: "calendar_create_event",
  description:
    'יוצר אירוע ביומן "בוט" של נועם. לא יוצר כפילות אם כבר נוצר אירוע עם אותו dedupe_key. ' +
    "start: YYYY-MM-DD ליום שלם, או YYYY-MM-DDTHH:MM:00+02:00 (שעון ישראל; בקיץ +03:00).",
  inputSchema: z.object({
    title: z.string(),
    start: z.string(),
    end: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    dedupe_key: z.string().describe("מזהה קצר וקבוע לאירוע, למשל 'צופים-פעולה-2026-12-01'"),
  }),
  run: async ({ title, start, end, location, description, dedupe_key }) => {
    if (!googleConfigured()) return NOT_CONNECTED;
    try {
      const r = await createBotEvent({ title, start, end, location, description, dedupeKey: dedupe_key });
      if (r.created) return `נוצר אירוע ביומן (id=${r.id})`;
      return r.duplicateOf ? `לא נוסף: כבר יש ביומן באותו יום "${r.duplicateOf}"` : `האירוע כבר קיים ביומן (id=${r.id})`;
    } catch (err) {
      return errText(err);
    }
  },
});

const calendarDeleteEvent = betaZodTool({
  name: "calendar_delete_event",
  description: 'מוחק אירוע מיומן "בוט" בלבד (לפי id מ-calendar_list_events).',
  inputSchema: z.object({ id: z.string() }),
  run: async ({ id }) => {
    if (!googleConfigured()) return NOT_CONNECTED;
    try {
      await deleteBotEvent(id);
      return "נמחק.";
    } catch (err) {
      return errText(err);
    }
  },
});

// ---------- משקל ----------

const logWeight = betaZodTool({
  name: "log_weight",
  description: "רושם שקילה. אם לא ניתן תאריך – היום.",
  inputSchema: z.object({
    kg: z.number().min(30).max(200),
    date: z.string().optional().describe("YYYY-MM-DD"),
    note: z.string().optional(),
  }),
  run: async ({ kg, date, note }) => {
    const d = date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    await db.insert(schema.weightLog).values({ date: d, kg, note: note ?? null });
    return `נרשם: ${kg} ק"ג (${d})`;
  },
});

const getWeightHistory = betaZodTool({
  name: "get_weight_history",
  description: "כל השקילות, מהישנה לחדשה.",
  inputSchema: z.object({}),
  run: async () => {
    const rows = await db.select().from(schema.weightLog).orderBy(asc(schema.weightLog.date), asc(schema.weightLog.id));
    return rows.length ? rows.map((r) => `${r.date}: ${r.kg} ק"ג${r.note ? ` (${r.note})` : ""}`).join("\n") : "אין שקילות רשומות.";
  },
});

export const tools = [
  getFacts,
  rememberFact,
  forgetFact,
  listGroups,
  getGroupMessages,
  getWorkoutPlan,
  setWorkoutDay,
  deleteWorkoutDay,
  getNutritionPlan,
  setNutritionPlan,
  logWeight,
  getWeightHistory,
  getTimetable,
  setTimetableDay,
  mashovGet,
  calendarListEvents,
  calendarCreateEvent,
  calendarDeleteEvent,
];
