import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at").notNull().default(sql`(datetime('now'))`);

/** עובדות כלליות עליי ("אני בכיתה י'", "כושר קרבי בימי ב'"). */
export const facts = sqliteTable("facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

/** המערכת הקבועה. dayOfWeek: 0=ראשון ... 6=שבת. */
export const timetable = sqliteTable("timetable", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source", { enum: ["mashov", "shahaf"] }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  lesson: integer("lesson").notNull(),
  subject: text("subject").notNull(),
  teacher: text("teacher"),
  room: text("room"),
  isSports: integer("is_sports", { mode: "boolean" }).notNull().default(false),
});

/** ביטולים, החלפות ומבחנים לתאריך מסוים. */
export const timetableChanges = sqliteTable(
  "timetable_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source", { enum: ["mashov", "shahaf"] }).notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    lesson: integer("lesson").notNull(),
    kind: text("kind", { enum: ["canceled", "substitute", "room_change", "exam", "other"] }).notNull(),
    subject: text("subject"),
    details: text("details"),
    fetchedAt: createdAt(),
  },
  (t) => [uniqueIndex("timetable_changes_uniq").on(t.source, t.date, t.lesson, t.kind)],
);

/** ציונים ממשו"ב. externalId מונע כפילויות ומאפשר לזהות ציון חדש. */
export const grades = sqliteTable("grades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull().unique(),
  subject: text("subject").notNull(),
  grade: real("grade"),
  gradeText: text("grade_text"),
  kind: text("kind"), // מבחן / בוחן / עבודה
  title: text("title"),
  date: text("date"),
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** התנהגויות ממשו"ב: חיסור, איחור, הערה, שבח. */
export const behavior = sqliteTable("behavior", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull().unique(),
  date: text("date").notNull(),
  lesson: integer("lesson"),
  subject: text("subject"),
  teacher: text("teacher"),
  kind: text("kind").notNull(),
  justified: integer("justified", { mode: "boolean" }),
  notified: integer("notified", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** תוכנית אימונים. day: "A"/"B" או יום בשבוע, לפי התוכנית שתישלח. */
export const workoutPlan = sqliteTable("workout_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  day: text("day").notNull(),
  order: integer("order").notNull(),
  exercise: text("exercise").notNull(),
  sets: integer("sets"),
  reps: text("reps"), // "12" או "8-10" או "30 שניות"
  restSeconds: integer("rest_seconds"),
  notes: text("notes"),
});

/** תוכנית תזונה. */
export const nutritionPlan = sqliteTable("nutrition_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  day: text("day"), // null = כל יום
  meal: text("meal").notNull(), // בוקר / ביניים / צהריים ...
  time: text("time"), // HH:MM
  description: text("description").notNull(),
});

/** הודעות גולמיות מהקבוצות המורשות בלבד. נמחקות אחרי 30 יום. */
export const groupMessages = sqliteTable("group_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waMessageId: text("wa_message_id").notNull().unique(),
  groupId: text("group_id").notNull(),
  groupName: text("group_name"),
  sender: text("sender"),
  text: text("text").notNull(),
  sentAt: text("sent_at").notNull(),
  parsed: integer("parsed", { mode: "boolean" }).notNull().default(false),
});

/** מה שחולץ מהקבוצות: אירוע, תשלום, ציוד, הזמנה. */
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["event", "payment", "gear", "order", "other"] }).notNull(),
  title: text("title").notNull(),
  details: text("details"),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  dueDate: text("due_date"),
  amount: real("amount"),
  link: text("link"),
  status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
  sourceMessageId: integer("source_message_id").references(() => groupMessages.id),
  calendarEventId: text("calendar_event_id"),
  dedupeKey: text("dedupe_key").unique(),
  createdAt: createdAt(),
});

/** תזכורות מתוזמנות. */
export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  remindAt: text("remind_at").notNull(),
  text: text("text").notNull(),
  itemId: integer("item_id").references(() => items.id),
  sent: integer("sent", { mode: "boolean" }).notNull().default(false),
});

/** היסטוריית השיחה איתי (לקונטקסט של הסוכן). */
export const conversation = sqliteTable("conversation", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(), // JSON של בלוקי התוכן
  createdAt: createdAt(),
});
