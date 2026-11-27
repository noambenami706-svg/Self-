/**
 * מחבר את יומן גוגל (פעם אחת).
 * 1. מחפש את קובץ ההרשאות שהורדת מגוגל (client_secret_....json) בתיקיית ההורדות ומעתיק אותו.
 * 2. פותח דפדפן לאישור, ושומר את ההרשאה במחשב.
 * הרצה: npm run google-auth
 */
import { exec } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { calendar } from "@googleapis/calendar";
import {
  BOT_CALENDAR_NAME,
  CREDENTIALS_PATH,
  SCOPES,
  TOKEN_PATH,
  ensureBotCalendar,
  makeOAuthClient,
} from "../src/connectors/google/calendar.js";

// 1. קובץ ההרשאות
if (!existsSync(CREDENTIALS_PATH)) {
  const downloads = path.join(homedir(), "Downloads");
  const files = existsSync(downloads)
    ? readdirSync(downloads)
        .filter((f) => /^client_secret.*\.json$/i.test(f))
        .map((f) => path.join(downloads, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
  if (!files.length) {
    console.log("❌ לא מצאתי קובץ client_secret_....json בתיקיית ההורדות. תוריד אותו מגוגל ותנסה שוב.");
    process.exit(1);
  }
  copyFileSync(files[0]!, CREDENTIALS_PATH);
  console.log("✅ מצאתי את קובץ ההרשאות והעתקתי אותו.");
}

// 2. אישור בדפדפן
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;
const client = makeOAuthClient(redirect);
const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", redirect);
    const c = u.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      c
        ? '<h2 dir="rtl" style="font-family:sans-serif">✅ יומן גוגל חובר. אפשר לסגור את החלון ולחזור לחלון הכחול.</h2>'
        : '<h2 dir="rtl" style="font-family:sans-serif">❌ האישור בוטל. חוזרים לחלון הכחול ומנסים שוב.</h2>',
    );
    server.close();
    c ? resolve(c) : reject(new Error(u.searchParams.get("error") ?? "בוטל"));
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log("\n🌐 נפתח דפדפן. בוחרים את חשבון הגוגל שלך ומאשרים.");
    console.log("אם הדפדפן לא נפתח, מעתיקים את הקישור הזה לדפדפן:\n" + url + "\n");
    const opener = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(opener);
  });
});

const { tokens } = await client.getToken(code);
writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 1));
client.setCredentials(tokens);
await ensureBotCalendar(calendar({ version: "v3", auth: client }));
console.log(`✅ יומן גוגל מחובר. הבוט כותב ליומן בשם "${BOT_CALENDAR_NAME}". מפעילים את הבוט מחדש: npm start`);
process.exit(0);
