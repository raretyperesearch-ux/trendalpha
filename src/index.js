// ============================================================
// TRENDALPHA — MAIN ENTRY POINT (Production)
// ============================================================
// Scans every 15 min, digest every 3 hours,
// re-alerts on big score jumps
// ============================================================

import cron from "node-cron";
import { config } from "./config.js";
import { fetchTrends } from "./tiktok.js";
import { scoreTrend } from "./scoring.js";
import { findToken } from "./tokens.js";
import { initBot, sendAlert, sendDigest } from "./telegram.js";
import {
  initDB,
  saveTrendSnapshot,
  getPreviousSnapshot,
  wasAlertedRecently,
  getLastAlertScore,
  recordAlert,
} from "./db.js";

// ----------------------------------------------------------
// NOISE FILTER
// ----------------------------------------------------------

const SKIP_HASHTAGS = new Set([
  "home", "fyp", "foryou", "foryoupage", "viral", "trending",
  "fy", "fypシ", "100kviews", "greenscreen", "capcut",
  "liveiseasy", "makefriendslive", "livewithlowfollowers", "livefest2025",
  "tiktoklivefest", "tiktoklive",
  "teamworkmakesthedreamwork", "sunsetvibes", "daytrading",
  "investing", "trading", "motivation", "love", "funny",
]);

const NON_ENGLISH_PATTERNS = [
  /indosiar/i, /dangdut/i, /dacademy/i,
  /berkelas/i, /berkualitas/i,
  /novela/i, /telenovela/i,
  /bollywood/i, /hindi/i,
  /copadelrey/i,
  /^#[a-z]{2}weather$/i,
];

function isNoise(trend) {
  const name = trend.name.replace("#", "").toLowerCase();
  if (SKIP_HASHTAGS.has(name)) return true;
  for (const pattern of NON_ENGLISH_PATTERNS) {
    if (pattern.test(trend.name)) return true;
  }
  if (name.length > 25) return true;
  if (trend.trendDirection === "falling") return true;
  return false;
}

// ----------------------------------------------------------
// SCAN — the core loop
// ----------------------------------------------------------

const MAX_ALERTS_PER_SCAN = 5;
const DELAY_BETWEEN_ALERTS_MS = 3000;
const SCORE_JUMP_THRESHOLD = 10; // re-alert if score jumps 10+ points

async function runScan() {
  const startTime = Date.now();
  console.log(`\n${"=".repeat(50)}`);
  console.log(`📡 SCAN STARTED — ${new Date().toISOString()}`);
  console.log(`${"=".repeat(50)}\n`);

  try {
    const trends = await fetchTrends();
    if (trends.length === 0) {
      console.log("❌ No trends found, skipping scan");
      return;
    }

    let alertsSent = 0;
    let trendsProcessed = 0;

    for (const trend of trends) {
      if (isNoise(trend)) continue;

      trendsProcessed++;

      const prevSnapshot = await getPreviousSnapshot(trend.id);
      const score = scoreTrend(trend, prevSnapshot);
      await saveTrendSnapshot(trend, score);

      const icon = score.total >= config.scan.minScore ? "🔥" : "  ";
      const arrow = trend.trendDirection === "rising" ? "📈" :
                    trend.trendDirection === "falling" ? "📉" : "➡️";
      console.log(
        `${icon} [${score.total}/100] ${trend.name} — ` +
        `${score.metrics.viewsPerHour.toLocaleString()} v/hr, ` +
        `${trend.videoCount.toLocaleString()} videos ${arrow}`
      );

      if (score.total < config.scan.minScore) continue;
      if (alertsSent >= MAX_ALERTS_PER_SCAN) continue;

      // Check if already alerted recently
      const alreadyAlerted = await wasAlertedRecently(trend.id);

      if (alreadyAlerted) {
        // BUT — re-alert if score jumped significantly
        const lastScore = await getLastAlertScore(trend.id);
        if (lastScore !== null && score.total >= lastScore + SCORE_JUMP_THRESHOLD) {
          console.log(`   🚀 Score jumped from ${lastScore} → ${score.total}! Re-alerting...`);
        } else {
          console.log(`   ⏭️  Already alerted for "${trend.name}" — skipping`);
          continue;
        }
      }

      const token = await findToken(trend.name);

      if (alertsSent > 0) {
        await sleep(DELAY_BETWEEN_ALERTS_MS);
      }

      const sent = await sendAlert({ trend, score, token });
      if (sent) {
        alertsSent++;
        await recordAlert(trend, score, token);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n📊 SCAN COMPLETE in ${elapsed}s`);
    console.log(`   Trends processed: ${trendsProcessed}`);
    console.log(`   Alerts sent: ${alertsSent}`);
    console.log(`   Min score threshold: ${config.scan.minScore}\n`);
  } catch (err) {
    console.error("❌ SCAN FAILED:", err);
  }
}

// ----------------------------------------------------------
// DIGEST — post top trends summary every 3 hours
// ----------------------------------------------------------

async function runDigest() {
  console.log(`\n📊 RUNNING DIGEST — ${new Date().toISOString()}\n`);

  try {
    const trends = await fetchTrends();
    if (trends.length === 0) {
      console.log("❌ No trends for digest");
      return;
    }

    // Score all non-noise trends
    const scored = [];
    for (const trend of trends) {
      if (isNoise(trend)) continue;
      const prevSnapshot = await getPreviousSnapshot(trend.id);
      const score = scoreTrend(trend, prevSnapshot);
      scored.push({ trend, score });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score.total - a.score.total);

    await sendDigest(scored.map(s => s.trend), scored);
  } catch (err) {
    console.error("❌ DIGEST FAILED:", err);
  }
}

// ----------------------------------------------------------
// STARTUP
// ----------------------------------------------------------

async function main() {
  console.log(`
  ╔══════════════════════════════════════╗
  ║    📡 TRENDALPHA v1.0               ║
  ║    TikTok → Crypto Signals          ║
  ╚══════════════════════════════════════╝
  `);

  console.log("🔧 Initializing...");
  initDB();
  const bot = initBot();

  bot.start({
    onStart: () => console.log("🤖 Telegram bot is online"),
  });

  // Run first scan immediately
  console.log("🚀 Running initial scan...\n");
  await runScan();

  // Schedule scans every 15 minutes
  const scanCron = `*/${config.scan.intervalMinutes} * * * *`;
  cron.schedule(scanCron, () => { runScan(); });
  console.log(`⏰ Scans: every ${config.scan.intervalMinutes} minutes`);

  // Schedule digest every 3 hours (at :30 to offset from scans)
  cron.schedule("30 */3 * * *", () => { runDigest(); });
  console.log(`📊 Digest: every 3 hours\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => { console.log("\n👋 Shutting down TrendAlpha..."); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n👋 Shutting down TrendAlpha..."); process.exit(0); });

main().catch(console.error);
