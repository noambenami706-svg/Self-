import { rmSync } from "node:fs";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { DATA_DIR } from "../db/index.js";

const SESSION_DIR = path.join(DATA_DIR, "wa-session");

export type WhatsAppHandlers = {
  /** נקרא בכל פעם שהחיבור נפתח (גם אחרי התחברות מחדש). */
  onOpen?: (sock: WASocket) => void | Promise<void>;
  /** נקרא על כל הודעה חדשה (לא היסטוריה). */
  onMessage?: (sock: WASocket, msg: WAMessage) => void | Promise<void>;
};

function statusCodeOf(error: unknown): number | undefined {
  const output = (error as { output?: { statusCode?: unknown } } | undefined)?.output;
  return typeof output?.statusCode === "number" ? output.statusCode : undefined;
}

/**
 * מתחבר לווטסאפ כמו WhatsApp Web. בפעם הראשונה מציג QR לסריקה,
 * ואחר כך משתמש ב-session השמור ב-data/wa-session.
 * מתחבר מחדש אוטומטית אם החיבור נופל.
 */
export async function connectWhatsApp(handlers: WhatsAppHandlers = {}): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.windows("Desktop"),
    logger: pino({ level: process.env.WA_LOG_LEVEL ?? "silent" }),
    markOnlineOnConnect: false, // שהטלפון ימשיך לקבל התראות כרגיל
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n📱 סרוק את הקוד עם הטלפון:");
      console.log("   ווטסאפ ← ⋮ (או הגדרות) ← מכשירים מקושרים ← קישור מכשיר\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ ווטסאפ מחובר");
      await handlers.onOpen?.(sock);
    }

    if (connection === "close") {
      const code = statusCodeOf(lastDisconnect?.error);
      if (code === DisconnectReason.loggedOut) {
        console.log("⚠️ המכשיר נותק מהטלפון. מוחק את ה-session ומציג QR חדש...");
        rmSync(SESSION_DIR, { recursive: true, force: true });
      } else if (code !== DisconnectReason.restartRequired) {
        console.log(`🔄 החיבור לווטסאפ נפל (${code ?? "?"}), מתחבר מחדש...`);
      }
      setTimeout(() => void connectWhatsApp(handlers), code === DisconnectReason.restartRequired ? 0 : 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !handlers.onMessage) return;
    for (const msg of messages) {
      try {
        await handlers.onMessage(sock, msg);
      } catch (error) {
        console.error("❌ שגיאה בטיפול בהודעה:", error);
      }
    }
  });
}
