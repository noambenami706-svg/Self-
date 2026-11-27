/**
 * חיבור למשו"ב דרך ה-API של אתר משו"ב (web.mashov.info), כמו שהאפליקציה עושה.
 * אין API רשמי ומתועד, ולכן הקוד לא מניח מבנה מדויק לנתונים: הוא מעביר ל-Claude
 * את ה-JSON (מקוצר), ו-Claude מפרש אותו.
 */
const BASE = "https://web.mashov.info/api";
const APP = {
  appName: "info.mashov.students",
  apiVersion: "3.20210425",
  appVersion: "3.20210425",
  appBuild: "3.20210425",
  deviceUuid: "chrome",
  devicePlatform: "chrome",
  deviceManufacturer: "win",
  deviceModel: "desktop",
  deviceVersion: "120.0.0.0",
};

/** המקומות במשו"ב שהבוט רשאי לקרוא. */
export const MASHOV_ENDPOINTS = ["grades", "behave", "homework", "timetable", "bells", "groups", "lessonsCount"] as const;
export type MashovEndpoint = (typeof MASHOV_ENDPOINTS)[number];

export interface MashovCreds {
  semel: number;
  year: number;
  username: string;
  password: string;
}

export class MashovError extends Error {}

/** שנת הלימודים לפי משו"ב: מספטמבר 2026 עד אוגוסט 2027 = 2027. */
export function currentSchoolYear(d = new Date()): number {
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}

export class MashovClient {
  private cookie = "";
  private csrf = "";
  private userId = "";

  constructor(private creds: MashovCreds) {}

  async login(): Promise<{ userId: string; name?: string }> {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...APP, semel: this.creds.semel, year: this.creds.year, username: this.creds.username, password: this.creds.password }),
    });
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new MashovError("שם המשתמש או הסיסמה של משו\"ב לא נכונים");
    if (!res.ok) throw new MashovError(`משו"ב החזיר שגיאה ${res.status} בכניסה`);
    const body = (await res.json()) as { credential?: { userId?: string }; accessToken?: { displayName?: string } };
    const userId = body.credential?.userId;
    if (!userId) throw new MashovError("משו\"ב לא החזיר מזהה תלמיד");

    this.csrf = res.headers.get("x-csrf-token") ?? "";
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]!);
    this.cookie = cookies.join("; ");
    this.userId = userId;
    return { userId, name: body.accessToken?.displayName };
  }

  /** קורא נתונים מאחד המקומות המותרים. נכנס מחדש אוטומטית אם החיבור פג. */
  async get(endpoint: MashovEndpoint): Promise<unknown> {
    if (!this.userId) await this.login();
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${BASE}/students/${this.userId}/${endpoint}`, {
        headers: { Accept: "application/json", Cookie: this.cookie, "X-Csrf-Token": this.csrf },
      });
      if (res.status === 401 || res.status === 403) {
        await this.login();
        continue;
      }
      if (!res.ok) throw new MashovError(`משו"ב: ${endpoint} החזיר ${res.status}`);
      return res.json();
    }
    throw new MashovError("משו\"ב: לא הצלחתי להתחבר מחדש");
  }
}

/** מחפש בתי ספר לפי חלק מהשם. */
export async function searchSchools(query: string): Promise<{ semel: number; name: string; years: number[] }[]> {
  const res = await fetch(`${BASE}/schools`);
  if (!res.ok) throw new MashovError(`לא הצלחתי לקבל את רשימת בתי הספר (${res.status})`);
  const all = (await res.json()) as { semel: number; name: string; years: number[] }[];
  const q = query.trim();
  return all.filter((s) => s.name.includes(q) || String(s.semel) === q);
}
