import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA_DIR = path.join(root, "data");
const DB_PATH = path.join(DATA_DIR, "bot.db");

mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/** מריץ את כל המיגרציות שעוד לא רצו (יוצר/מעדכן טבלאות). */
export function migrateDb(): void {
  migrate(db, { migrationsFolder: path.join(root, "drizzle") });
}

export { schema, DB_PATH };
