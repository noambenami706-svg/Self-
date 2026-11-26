/**
 * מציג את כל קבוצות הווטסאפ שלך עם המזהה של כל אחת, ושומר אותן ב-data/groups.txt
 * (בחלון של PowerShell העברית מופיעה הפוכה, בקובץ היא תקינה).
 * הרצה: npm run list-groups   (קודם עוצרים את הבוט עם Ctrl+C)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../src/db/index.js";
import { startWhatsApp } from "../src/whatsapp/client.js";

const OUT = path.join(DATA_DIR, "groups.txt");

await startWhatsApp({
  onMessage: () => {},
  async onReady(wa) {
    const groups = Object.values(await wa.sock.groupFetchAllParticipating());
    groups.sort((a, b) => (a.subject ?? "").localeCompare(b.subject ?? "", "he"));
    writeFileSync(
      OUT,
      `הקבוצות שלך בווטסאפ (${groups.length})\n` +
        `מעתיקים את המזהה (השורה שנגמרת ב-@g.us) של כל קבוצה שהבוט יקרא\n` +
        `לקובץ .env בשורה WHATSAPP_GROUP_IDS=, מופרדים בפסיק.\n\n` +
        groups.map((g) => `${g.subject}\n${g.id}\n`).join("\n"),
      "utf8",
    );
    console.log(`\n✅ נמצאו ${groups.length} קבוצות. לפתיחת הרשימה:  notepad data\\groups.txt`);
    setTimeout(() => process.exit(0), 2000); // זמן לשמור את ה-session
  },
});
