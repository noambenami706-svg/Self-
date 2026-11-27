/**
 * מחבר את משו"ב: בוחרים בית ספר, מכניסים שם משתמש וסיסמה, בודקים שהכניסה עובדת ושומרים ב-.env.
 * הרצה: npm run set-mashov
 */
import { MASHOV_ENDPOINTS, MashovClient, MashovError, currentSchoolYear, searchSchools } from "../src/connectors/school/mashov.js";
import { setEnvValues } from "./env-file.js";
import { ask, askHidden, clearScreen } from "./prompt.js";

const year = currentSchoolYear();

// 1. בית ספר
let semel = 0;
while (!semel) {
  const q = await ask("\nהקלד חלק משם בית הספר (או את סמל המוסד) ולחץ Enter:\n> ");
  const found = (await searchSchools(q)).filter((s) => s.years.includes(year));
  if (!found.length) {
    console.log("❌ לא נמצא. נסה מילה אחרת מהשם (למשל רק שם העיר או חלק מהשם).");
    continue;
  }
  const list = found.slice(0, 15);
  list.forEach((s, i) => console.log(`  ${i + 1}) ${s.name}  [${s.semel}]`));
  if (found.length > list.length) console.log(`  ...ועוד ${found.length - list.length}. אפשר לחפש מדויק יותר.`);
  const pick = Number(await ask("\nהקלד את המספר של בית הספר שלך (או Enter לחיפוש חדש):\n> "));
  if (pick >= 1 && pick <= list.length) semel = list[pick - 1]!.semel;
}

// 2. משתמש וסיסמה
const username = await ask("\nשם המשתמש במשו\"ב (בדרך כלל תעודת זהות):\n> ");
const password = await askHidden("\nהסיסמה של משו\"ב (תוסתר בכוכביות):\n> ");
clearScreen();

// 3. בדיקה
console.log("\n⏳ בודק כניסה למשו\"ב...");
const client = new MashovClient({ semel, year, username, password });
try {
  const me = await client.login();
  console.log(`✅ נכנסתי למשו"ב${me.name ? ` בתור ${me.name}` : ""}`);
} catch (err) {
  console.log(`❌ ${err instanceof MashovError ? err.message : String(err)}`);
  console.log("שום דבר לא נשמר. נסה שוב: npm run set-mashov");
  process.exit(1);
}

setEnvValues({
  MASHOV_SCHOOL_ID: String(semel),
  MASHOV_YEAR: String(year),
  MASHOV_USERNAME: username,
  MASHOV_PASSWORD: password,
});
console.log("✅ נשמר בקובץ .env (רק על המחשב שלך)\n");

// 4. מה זמין (בלי להציג מידע אישי)
console.log("בדיקה של מה אפשר לקרוא:");
for (const ep of MASHOV_ENDPOINTS) {
  try {
    const data = await client.get(ep);
    const n = Array.isArray(data) ? `${data.length} פריטים` : "יש";
    console.log(`  ✅ ${ep}: ${n}`);
  } catch {
    console.log(`  ❌ ${ep}`);
  }
}
console.log("\nסיימנו. מפעילים את הבוט מחדש: npm start");
