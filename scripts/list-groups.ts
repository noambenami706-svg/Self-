/**
 * מציג את כל קבוצות הווטסאפ שלך עם המזהה של כל אחת.
 * הרצה: npm run list-groups   (קודם עוצרים את הבוט עם Ctrl+C)
 */
import { startWhatsApp } from "../src/whatsapp/client.js";

await startWhatsApp({
  onMessage: () => {},
  async onReady(wa) {
    const groups = Object.values(await wa.sock.groupFetchAllParticipating());
    groups.sort((a, b) => a.subject.localeCompare(b.subject, "he"));
    console.log(`\nנמצאו ${groups.length} קבוצות:\n`);
    for (const g of groups) console.log(`${g.id}   ${g.subject}`);
    console.log("\nמעתיקים את המזהים (החלק שנגמר ב-@g.us) של הקבוצות הרצויות לקובץ .env");
    console.log("בשורה WHATSAPP_GROUP_IDS=, מופרדים בפסיק.");
    process.exit(0);
  },
});
