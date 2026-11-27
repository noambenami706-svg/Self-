import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** מעדכן (או מוסיף) ערכים בקובץ .env בלי לגעת בשאר. */
export function setEnvValues(values: Record<string, string>) {
  const path = ".env";
  let text = existsSync(path) ? readFileSync(path, "utf8").replace(/^﻿/, "") : readFileSync(".env.example", "utf8");
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(path, text, "utf8");
}
