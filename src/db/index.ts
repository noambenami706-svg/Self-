import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(root, "data");
const DB_PATH = path.join(DATA_DIR, "bot.db");

mkdirSync(DATA_DIR, { recursive: true });

// libsql מגיע עם קבצים מוכנים ל-Windows/Mac/Linux, בלי צורך ב-Visual Studio.
const client = createClient({ url: pathToFileURL(DB_PATH).href });

export const db = drizzle(client, { schema });

/** מריץ את כל המיגרציות שעוד לא רצו (יוצר/מעדכן טבלאות). */
export async function migrateDb(): Promise<void> {
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.join(root, "drizzle") });
}

export { schema, DB_PATH };
