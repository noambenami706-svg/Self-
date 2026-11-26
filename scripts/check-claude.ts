/**
 * בדיקה שמפתח ה-API עובד: שולח ל-Claude הודעה קצרה בעברית ומדפיס את התשובה.
 * הרצה: npm run check-claude
 */
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, FALLBACK_BETA, getClaude } from "../src/llm/claude.js";

try {
  const response = await getClaude().beta.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "תגיד שלום בעברית במשפט אחד קצר." }],
  });

  if (response.stop_reason === "refusal") {
    console.log("⚠️ Claude סירב לבקשה. זה לא אמור לקרות בבדיקה הזו.");
    process.exit(1);
  }
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
  console.log(`✅ Claude עובד (${response.model}):`);
  console.log(text);
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("❌ המפתח לא תקין. בדוק שהעתקת אותו נכון ל-.env");
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    console.error("❌ אין הרשאה. בדוק שיש קרדיט בחשבון (Billing ב-console.anthropic.com)");
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("❌ יותר מדי בקשות. נסה שוב בעוד דקה");
  } else if (error instanceof Anthropic.APIConnectionError) {
    console.error("❌ אין חיבור לאינטרנט או ל-API");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`❌ שגיאת API ${error.status}: ${error.message}`);
  } else {
    console.error("❌", error instanceof Error ? error.message : error);
  }
  process.exit(1);
}
