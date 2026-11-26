import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { DATA_DIR } from "../db/index.js";
import type { WhatsApp } from "./client.js";

/** מזהה קבוצה → שם, לכל הקבוצות שהבוט רשאי לקרוא. */
export const allowedGroups = new Map<string, string>();

/** מנרמל שם קבוצה: בלי אימוג'ים, גרשיים וסימנים, רווחים אחידים. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s()]/gu, "") // משאיר רק אותיות, ספרות, רווחים וסוגריים
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * בונה את רשימת הקבוצות המורשות: מזהים מ-WHATSAPP_GROUP_IDS
 * + קבוצות שהשם שלהן תואם ל-WHATSAPP_GROUP_NAMES.
 * כותב את התוצאה ל-data/active-groups.txt כדי שיהיה קל לבדוק.
 */
export async function resolveAllowedGroups(wa: WhatsApp): Promise<{ missing: string[] }> {
  const all = Object.values(await wa.sock.groupFetchAllParticipating());
  const byId = new Map(all.map((g) => [g.id, g.subject ?? ""]));

  allowedGroups.clear();
  for (const id of config.WHATSAPP_GROUP_IDS) allowedGroups.set(id, byId.get(id) ?? id);

  const missing: string[] = [];
  for (const wanted of config.WHATSAPP_GROUP_NAMES) {
    const w = normalizeName(wanted);
    const matches = all.filter((g) => normalizeName(g.subject ?? "") === w);
    if (matches.length === 0) missing.push(wanted);
    for (const g of matches) allowedGroups.set(g.id, g.subject ?? "");
  }

  const lines = [...allowedGroups].map(([id, name]) => `✅ ${name}\n   ${id}`);
  for (const m of missing) lines.push(`❌ לא נמצאה: ${m}`);
  writeFileSync(
    path.join(DATA_DIR, "active-groups.txt"),
    `הקבוצות שהבוט קורא (${allowedGroups.size}):\n\n${lines.join("\n\n")}\n`,
    "utf8",
  );
  return { missing };
}
