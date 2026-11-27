import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import { config } from "../../config.js";
import { DATA_DIR } from "../../db/index.js";

export const CREDENTIALS_PATH = path.join(DATA_DIR, "google-credentials.json");
export const TOKEN_PATH = path.join(DATA_DIR, "google-token.json");
const BOT_CAL_PATH = path.join(DATA_DIR, "google-calendar.json");
export const SCOPES = ["https://www.googleapis.com/auth/calendar"];
export const BOT_CALENDAR_NAME = "בוט";

interface InstalledCreds {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

export function googleConfigured(): boolean {
  return existsSync(CREDENTIALS_PATH) && existsSync(TOKEN_PATH);
}

export function makeOAuthClient(redirectUri?: string): OAuth2Client {
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as InstalledCreds;
  const c = raw.installed ?? raw.web;
  if (!c) throw new Error("קובץ ההרשאות של גוגל לא תקין");
  return new OAuth2Client({ clientId: c.client_id, clientSecret: c.client_secret, redirectUri });
}

let api: calendar_v3.Calendar | undefined;

function getApi(): calendar_v3.Calendar {
  if (api) return api;
  if (!googleConfigured()) throw new Error("יומן גוגל לא מחובר. מריצים במחשב: npm run google-auth");
  const auth = makeOAuthClient();
  auth.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf8")));
  // שומר טוקן מחודש כשגוגל מנפיק אחד
  auth.on("tokens", (t) => {
    const old = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
    writeFileSync(TOKEN_PATH, JSON.stringify({ ...old, ...t }, null, 1));
  });
  api = calendar({ version: "v3", auth });
  return api;
}

/** מוצא (או יוצר) את יומן-המשנה "בוט" שאליו הבוט כותב. */
export async function ensureBotCalendar(cal = getApi()): Promise<string> {
  if (existsSync(BOT_CAL_PATH)) return (JSON.parse(readFileSync(BOT_CAL_PATH, "utf8")) as { id: string }).id;
  const list = await cal.calendarList.list();
  let id = list.data.items?.find((c) => c.summary === BOT_CALENDAR_NAME)?.id ?? undefined;
  if (!id) {
    const created = await cal.calendars.insert({ requestBody: { summary: BOT_CALENDAR_NAME, timeZone: config.TIMEZONE } });
    id = created.data.id!;
  }
  writeFileSync(BOT_CAL_PATH, JSON.stringify({ id }));
  return id;
}

export interface SimpleEvent {
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  id: string;
  fromBot: boolean;
}

/** אירועים מכל היומנים שמסומנים אצלך כמוצגים, בטווח זמנים. */
export async function listEvents(fromIso: string, toIso: string): Promise<SimpleEvent[]> {
  const cal = getApi();
  const botId = await ensureBotCalendar(cal);
  const cals = (await cal.calendarList.list()).data.items?.filter((c) => c.selected || c.id === botId) ?? [];
  const out: SimpleEvent[] = [];
  for (const c of cals) {
    const res = await cal.events.list({
      calendarId: c.id!,
      timeMin: fromIso,
      timeMax: toIso,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });
    for (const e of res.data.items ?? []) {
      out.push({
        calendar: c.summaryOverride ?? c.summary ?? "",
        title: e.summary ?? "(בלי כותרת)",
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
        allDay: !!e.start?.date,
        location: e.location ?? undefined,
        id: e.id!,
        fromBot: c.id === botId,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** יוצר אירוע ביומן "בוט". אם כבר קיים אירוע עם אותו מפתח – לא יוצר שוב. */
export async function createBotEvent(e: {
  title: string;
  start: string; // ISO date-time או YYYY-MM-DD ליום שלם
  end?: string;
  location?: string;
  description?: string;
  dedupeKey: string;
}): Promise<{ created: boolean; id: string }> {
  const cal = getApi();
  const calendarId = await ensureBotCalendar(cal);
  const existing = await cal.events.list({ calendarId, privateExtendedProperty: [`dedupe=${e.dedupeKey}`], maxResults: 1 });
  const found = existing.data.items?.[0];
  if (found?.id) return { created: false, id: found.id };

  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  const end =
    e.end ??
    (allDay
      ? new Date(Date.parse(e.start) + 86_400_000).toISOString().slice(0, 10)
      : new Date(Date.parse(e.start) + 60 * 60_000).toISOString());
  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: e.title,
      location: e.location,
      description: e.description,
      start: allDay ? { date: e.start } : { dateTime: e.start, timeZone: config.TIMEZONE },
      end: allDay ? { date: end } : { dateTime: end, timeZone: config.TIMEZONE },
      extendedProperties: { private: { dedupe: e.dedupeKey } },
    },
  });
  return { created: true, id: res.data.id! };
}

/** מוחק אירוע – רק מיומן "בוט" (הבוט לא נוגע ביומנים האחרים שלך). */
export async function deleteBotEvent(id: string): Promise<void> {
  const cal = getApi();
  await cal.events.delete({ calendarId: await ensureBotCalendar(cal), eventId: id });
}
