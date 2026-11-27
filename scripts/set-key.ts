/**
 * מכניס את מפתח ה-API לקובץ .env בלי לפתוח אותו.
 * הרצה: npm run set-key  → מדביקים את המפתח (קליק ימני) → Enter
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// המפתח לא מוצג על המסך בזמן ההדבקה (כמו סיסמה)
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
rlAny._writeToOutput = (s: string) => {
  if (!muted || s.includes("\n")) process.stdout.write(muted ? "\n" : s);
  else process.stdout.write("*".repeat(Math.min(s.length, 1)));
};
const question = rl.question("\nהדבק כאן את המפתח (קליק ימני) ולחץ Enter. הוא יוסתר בכוכביות:\n> ");
muted = true;
const key = (await question).trim();
rl.close();
// ליתר ביטחון: מנקה את המסך (כולל היסטוריית הגלילה) כדי שהמפתח לא יישאר גלוי
process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

if (!/^sk-ant-[\w-]{20,}$/.test(key)) {
  console.log("\n❌ זה לא נראה כמו מפתח. מפתח מתחיל ב-sk-ant- . תעתיק שוב מהאתר ותנסה שוב.");
  process.exit(1);
}

const path = ".env";
let text = existsSync(path) ? readFileSync(path, "utf8").replace(/^﻿/, "") : readFileSync(".env.example", "utf8");
const line = `ANTHROPIC_API_KEY=${key}`;
text = /^ANTHROPIC_API_KEY=.*$/m.test(text)
  ? text.replace(/^ANTHROPIC_API_KEY=.*$/m, line)
  : `${line}\n${text}`;
writeFileSync(path, text, "utf8");

console.log(`\n✅ המפתח נשמר (${key.slice(0, 10)}...). עכשיו: npm run check-claude`);
