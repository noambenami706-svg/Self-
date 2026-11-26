import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const schema = z.object({
  ANTHROPIC_API_KEY: optionalString,
  TIMEZONE: z.string().default("Asia/Jerusalem"),
  MORNING_BRIEFING_TIME: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "צריך להיות בפורמט HH:MM, למשל 07:15")
    .default("07:15"),
  BOT_PREFIX: z.string().min(1).default("/בוט"),
  WHATSAPP_GROUP_IDS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  MASHOV_SCHOOL_ID: optionalString,
  MASHOV_USERNAME: optionalString,
  MASHOV_PASSWORD: optionalString,
  SHAHAF_USERNAME: optionalString,
  SHAHAF_PASSWORD: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ יש בעיה בקובץ .env:");
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
