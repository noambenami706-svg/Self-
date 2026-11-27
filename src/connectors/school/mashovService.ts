import { config } from "../../config.js";
import { MashovClient, currentSchoolYear } from "./mashov.js";

let client: MashovClient | undefined;

export function mashovConfigured(): boolean {
  return !!(config.MASHOV_SCHOOL_ID && config.MASHOV_USERNAME && config.MASHOV_PASSWORD);
}

/** לקוח משו"ב אחד לכל התוכנה (שומר את החיבור). */
export function getMashov(): MashovClient {
  if (!mashovConfigured()) throw new Error('משו"ב לא מחובר. מריצים: npm run set-mashov');
  client ??= new MashovClient({
    semel: Number(config.MASHOV_SCHOOL_ID),
    year: config.MASHOV_YEAR ?? currentSchoolYear(),
    username: config.MASHOV_USERNAME!,
    password: config.MASHOV_PASSWORD!,
  });
  return client;
}

/** מקצר JSON גדול: במערכים לוקח רק את N הפריטים האחרונים. */
export function trimForModel(data: unknown, lastN = 60, maxChars = 30_000): string {
  const d = Array.isArray(data) ? data.slice(-lastN) : data;
  const s = JSON.stringify(d);
  return s.length > maxChars ? `${s.slice(0, maxChars)}…(קוצר)` : s;
}
