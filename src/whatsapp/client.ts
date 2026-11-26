import path from "node:path";
import makeWASocket, {
  DisconnectReason,
  type WAMessage,
  type WASocket,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { DATA_DIR } from "../db/index.js";

// ספריית ההצפנה של ווטסאפ מדפיסה מפתחות למסך ("Closing session: ..."). משתיקים את זה.
const originalInfo = console.info;
console.info = (...args: unknown[]) => {
  if (typeof args[0] === "string" && /^(Closing|Opening|Removing old closed|Migrating) session/.test(args[0])) return;
  originalInfo(...args);
};

const SESSION_DIR = path.join(DATA_DIR, "wa-session");

export interface WhatsAppHandlers {
  /** נקרא על כל הודעה חדשה (כולל הודעות שאני שולח). */
  onMessage: (msg: WAMessage, wa: WhatsApp) => void | Promise<void>;
  /** נקרא כשהחיבור מוכן. */
  onReady?: (wa: WhatsApp) => void | Promise<void>;
}

export interface WhatsApp {
  sock: WASocket;
  /** כל המזהים של הצ'אט "הודעה לעצמי" (מספר טלפון + LID). */
  selfJids: Set<string>;
  /** שולח הודעה לצ'אט מסוים (רק הצ'אט עם עצמי או קבוצת הבוט). */
  sendTo: (jid: string, text: string) => Promise<void>;
  /** שולח הודעה יזומה: לקבוצת הבוט אם קיימת, אחרת ל"הודעה לעצמי". */
  sendToMe: (text: string) => Promise<void>;
  /** מזהה קבוצת הבוט ("יודע הכל"), אם נמצאה. */
  botGroupId?: string;
  /** מזהי הודעות שהבוט עצמו שלח – כדי לא לענות לעצמו. */
  sentByBot: Set<string>;
}

/** מתחבר לווטסאפ. בפעם הראשונה מציג QR לסריקה; אחר כך נכנס לבד. */
export async function startWhatsApp(handlers: WhatsAppHandlers): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    markOnlineOnConnect: false, // לא להופיע "מחובר" בגלל הבוט
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  const sentByBot = new Set<string>();
  const wa: WhatsApp = {
    sock,
    selfJids: new Set(),
    sentByBot,
    async sendTo(jid, text) {
      const sent = await sock.sendMessage(jid, { text });
      if (sent?.key.id) sentByBot.add(sent.key.id);
    },
    async sendToMe(text) {
      const to = wa.botGroupId ?? (sock.user?.id ? jidNormalizedUser(sock.user.id) : undefined);
      if (!to) throw new Error("ווטסאפ עוד לא מחובר");
      await wa.sendTo(to, text);
    },
  };

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\n📱 סרוק את הקוד: ווטסאפ ← ⋮ ← מכשירים מקושרים ← קישור מכשיר\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      wa.selfJids.clear();
      if (sock.user?.id) wa.selfJids.add(jidNormalizedUser(sock.user.id));
      if (sock.user?.lid) wa.selfJids.add(jidNormalizedUser(sock.user.lid));
      console.log("✅ ווטסאפ מחובר");
      await handlers.onReady?.(wa);
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log("❌ התנתקת מווטסאפ. מחק את התיקייה data\\wa-session והפעל שוב כדי לסרוק QR חדש.");
        process.exit(1);
      }
      console.log("🔄 החיבור לווטסאפ נפל, מתחבר מחדש...");
      setTimeout(() => void startWhatsApp(handlers), 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        await handlers.onMessage(msg, wa);
      } catch (err) {
        console.error("שגיאה בטיפול בהודעה:", err);
      }
    }
  });
}

/** שולף את הטקסט מהודעה (טקסט רגיל, טקסט מורחב, או כיתוב של תמונה/קובץ). */
export function messageText(msg: WAMessage): string {
  const m = normalizeMessageContent(msg.message);
  return (
    m?.conversation ??
    m?.extendedTextMessage?.text ??
    m?.imageMessage?.caption ??
    m?.documentMessage?.caption ??
    m?.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    ""
  ).trim();
}
