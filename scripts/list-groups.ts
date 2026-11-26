/**
 * מתחבר לווטסאפ (בפעם הראשונה: סריקת QR), מדפיס את כל הקבוצות שלך עם המזהה שלהן,
 * ושומר את הרשימה ב-data/groups.txt.
 * הרצה: npm run list-groups
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../src/db/index.js";
import { connectWhatsApp } from "../src/whatsapp/client.js";

const OUT = path.join(DATA_DIR, "groups.txt");

await connectWhatsApp({
  async onOpen(sock) {
    const groups = Object.values(await sock.groupFetchAllParticipating()).sort((a, b) =>
      (a.subject ?? "").localeCompare(b.subject ?? "", "he"),
    );

    const lines = groups.map((g) => `${g.subject}\n${g.id}\n`);
    writeFileSync(
      OUT,
      `הקבוצות שלך בווטסאפ (${groups.length})\n` +
        `העתק את המזהה (השורה שנגמרת ב-@g.us) של כל קבוצה שהבוט יקרא.\n\n` +
        lines.join("\n"),
      "utf8",
    );

    console.log(`\n✅ נמצאו ${groups.length} קבוצות. הרשימה נשמרה ב:\n   ${OUT}`);
    console.log("\nכדי לפתוח אותה:  notepad data\\groups.txt");
    // נותנים לווטסאפ רגע לשמור את ה-session ואז יוצאים
    setTimeout(() => process.exit(0), 2000);
  },
});
