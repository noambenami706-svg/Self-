/**
 * מכניס את מפתח ה-API לקובץ .env בלי לפתוח אותו.
 * הרצה: npm run set-key  → מדביקים את המפתח (קליק ימני) → Enter
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const key = (await rl.question("\nהדבק כאן את המפתח (קליק ימני) ולחץ Enter:\n> ")).trim();
rl.close();

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
