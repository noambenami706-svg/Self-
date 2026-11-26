import type Anthropic from "@anthropic-ai/sdk";
import { desc } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { CHAT_MODEL, FALLBACK_BETA, getClaude } from "../llm/claude.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { tools } from "./tools.js";

type Attachment = Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock;

const HISTORY_TURNS = 12;

function nowInIsrael(): string {
  return new Date().toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ההודעות האחרונות בשיחה (רק הטקסט – בלי קריאות לכלים). */
async function loadHistory(): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await db
    .select()
    .from(schema.conversation)
    .orderBy(desc(schema.conversation.id))
    .limit(HISTORY_TURNS * 2);
  rows.reverse();
  // השיחה חייבת להתחיל בהודעה של המשתמש
  while (rows[0] && rows[0].role !== "user") rows.shift();
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

async function saveTurn(user: string, assistant: string) {
  await db.insert(schema.conversation).values([
    { role: "user", content: user },
    { role: "assistant", content: assistant },
  ]);
}

/** מקבל הודעה מנועם (ואולי קובץ מצורף), מפעיל את Claude עם הכלים, ומחזיר תשובה. */
export async function runAgent(text: string, attachment?: Attachment): Promise<string> {
  const history = await loadHistory();
  const userText = `[עכשיו: ${nowInIsrael()}]\n${text || "(בלי טקסט)"}`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = attachment
    ? [attachment, { type: "text", text: userText }]
    : [{ type: "text", text: userText }];

  const finalMessage = await getClaude().beta.messages.toolRunner({
    model: CHAT_MODEL,
    max_tokens: 4096,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    system: SYSTEM_PROMPT,
    tools,
    messages: [...history, { role: "user", content }],
    max_iterations: 10,
  });

  let reply: string;
  if (finalMessage.stop_reason === "refusal") {
    reply = "לא יכול לעזור עם זה.";
  } else {
    reply =
      finalMessage.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("")
        .trim() || "לא הצלחתי לנסח תשובה, נסה לשאול שוב.";
  }

  await saveTurn(attachment ? `${userText}\n[צורף קובץ]` : userText, reply);
  return reply;
}
