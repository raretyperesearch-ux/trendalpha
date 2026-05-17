// ============================================================
// Test memory-only PumpPortal dry-run launches from Supabase
// Run: npm run test-shadow-launches
// ============================================================

import { config } from "../config.js";
import { initDB } from "../db.js";
import { initBot } from "../telegram.js";
import { runMemoryOnlyLaunchTest } from "../shadowLaunches.js";

const sendTelegram = process.env.SEND_TELEGRAM === "true" || config.launch.memoryOnlyLaunchTestMode;
const limit = Number(process.env.SHADOW_LAUNCH_LIMIT || 5);
const hours = Number(process.env.SHADOW_LAUNCH_MEMORY_HOURS || 168);

console.log("🧪 Testing memory-only shadow launches");
console.log(`   Telegram alerts: ${sendTelegram ? "enabled" : "disabled"}`);

initDB();
if (sendTelegram) initBot();

await runMemoryOnlyLaunchTest({
  force: true,
  sendTelegram,
  limit,
  hours,
});
