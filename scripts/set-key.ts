/**
 * מכניס את מפתח ה-API לקובץ .env בלי לפתוח אותו.
 * הרצה: npm run set-key  → מדביקים את המפתח (קליק ימני) → Enter
 */
import { setEnvValues } from "./env-file.js";
import { askHidden, clearScreen } from "./prompt.js";

const key = await askHidden("\nהדבק כאן את המפתח (קליק ימני) ולחץ Enter. הוא יוסתר בכוכביות:\n> ");
clearScreen();

if (!/^sk-ant-[\w-]{20,}$/.test(key)) {
  console.log("\n❌ זה לא נראה כמו מפתח. מפתח מתחיל ב-sk-ant- . תעתיק שוב מהאתר ותנסה שוב.");
  process.exit(1);
}
setEnvValues({ ANTHROPIC_API_KEY: key });
console.log(`\n✅ המפתח נשמר (${key.slice(0, 10)}...). עכשיו: npm run check-claude`);
