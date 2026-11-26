import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

/** הסוכן הראשי – שיחה איתי. */
export const CHAT_MODEL = "claude-sonnet-5-5";
/** מנתח הקבוצות ברקע – זול ומהיר. */
export const PARSER_MODEL = "claude-haiku-5-5";

/**
 * אם Claude מסרב לבקשה מסיבות בטיחות, ה-API מריץ אותה אוטומטית
 * על מודל גיבוי באותה קריאה (server-side fallback).
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;

export function getClaude(): Anthropic {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("חסר ANTHROPIC_API_KEY בקובץ .env (ראה README → שלב 0)");
  }
  client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return client;
}
