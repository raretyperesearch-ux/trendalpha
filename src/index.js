// ============================================================
// OINK — MAIN ENTRY POINT (Production)
// ============================================================
// Scans every 15 min, digest every 3 hours,
// re-alerts on big score jumps
// ============================================================

import cron from "node-cron";
import { config } from "./config.js";
import { fetchAllAttentionSources } from "./providers/index.js";
import { applyXSnapshotPersistence } from "./providers/xProvider.js";
import { applyLaunchWorthiness } from "./launchWorthiness.js";
import { buildNarrativeClusters, getStrongNarrativeClusters } from "./narrativeClusters.js";
import { scoreTrend } from "./scoring.js";
import { scoreLaunchOpportunity } from "./launchScoring.js";
import { generateLaunchBrief } from "./launchBrief.js";
import { preparePumpFunLaunch } from "./launchers/pumpfun.js";
import { findToken } from "./tokens.js";
import { initBot, sendAlert, sendDigest, sendLaunchCandidate, sendNarrativeClusterAlert } from "./telegram.js";
import {
  initDB,
  saveTrendSnapshot,
  saveNarrativeClusterSnapshot,
  getRecentNarrativeClusterSnapshots,
  wasClusterAlertedRecently,
  recordClusterAlert,
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

  // Hashtag-specific filters
  if (trend.type === "hashtag") {
    if (SKIP_HASHTAGS.has(name)) return true;
    for (const pattern of NON_ENGLISH_PATTERNS) {
      if (pattern.test(trend.name)) return true;
    }
    if (name.length > 25) return true;
  }

  // Song-specific filters — skip non-English songs
  if (trend.type === "song") {
    for (const pattern of NON_ENGLISH_PATTERNS) {
      if (pattern.test(trend.name)) return true;
    }
  }

  // Universal: skip falling trends
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
    const trends = await fetchAllAttentionSources();
    if (trends.length === 0) {
      console.log("❌ No trends found, skipping scan");
      return;
    }

    let alertsSent = 0;
    let trendsProcessed = 0;
    alertsSent += await processNarrativeClusters(trends, alertsSent);

    for (const trend of trends) {
      if (isNoise(trend)) continue;

      trendsProcessed++;

      const prevSnapshot = await getPreviousSnapshot(trend.id);
      applyXSnapshotPersistence(trend, prevSnapshot);
      if (trend.sourcePlatform === "x") logXPropagationSnapshot(trend);
      const score = scoreTrend(trend, prevSnapshot);
      await saveTrendSnapshot(trend, score);

      const icon = score.total >= config.scan.minScore ? "🔥" : "  ";
      const arrow = trend.trendDirection === "rising" ? "📈" :
                    trend.trendDirection === "falling" ? "📉" : "➡️";
      const isNewEntry = trend.rankChangeType === 3;

      if (isNewEntry) {
        console.log(
          `🆕 [${score.total}/100] ${trend.name} — NEW ENTRY TO TOP 100 — ` +
          `${score.metrics.viewsPerHour.toLocaleString()} v/hr, ` +
          `${formatParticipation(trend)} ${arrow}`
        );
      } else {
        console.log(
          `${icon} [${score.total}/100] ${trend.name} — ` +
          `${score.metrics.viewsPerHour.toLocaleString()} v/hr, ` +
          `${formatParticipation(trend)} ${arrow}`
        );
      }

      // NEW ENTRIES always get alerted (minimum score 50)
      // Regular trends need to meet the normal threshold
      const earlyLaunchScore = config.launch.enableLaunchCandidates
        ? scoreLaunchOpportunity(trend, null, prevSnapshot)
        : null;
      const meetsThreshold = isNewEntry ? score.total >= 50 : score.total >= config.scan.minScore;
      const mayQualifyForLaunch = earlyLaunchScore?.total >= config.launch.minLaunchScore;
      if (!meetsThreshold && !mayQualifyForLaunch) continue;
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

      const token = await findToken(trend);
      applyLaunchWorthiness(trend, token);
      if (trend.sourcePlatform === "x" && trend.launchWorthinessScore >= 62) {
        logLaunchWorthiness(trend);
      }
      const launchScore = config.launch.enableLaunchCandidates
        ? scoreLaunchOpportunity(trend, token, prevSnapshot)
        : null;

      if (alertsSent > 0) {
        await sleep(DELAY_BETWEEN_ALERTS_MS);
      }

      if (launchScore?.total >= config.launch.minLaunchScore) {
        const launchBrief = generateLaunchBrief({
          trend,
          trendScore: score,
          launchScore,
          token,
        });
        const preparedLaunch = preparePumpFunLaunch(launchBrief);
        const sent = await sendLaunchCandidate({
          trend,
          trendScore: score,
          launchScore,
          launchBrief,
          preparedLaunch,
        });
        if (sent) {
          alertsSent++;
          await recordAlert(trend, launchScore, token);
        }
        continue;
      }

      if (!meetsThreshold) continue;

      const sent = await sendAlert({ trend, score, token, isNewEntry });
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

async function processNarrativeClusters(trends, alertsSent) {
  const xTrends = trends.filter((trend) => trend.sourcePlatform === "x");
  if (xTrends.length === 0) return 0;

  const previousClusters = await getRecentNarrativeClusterSnapshots();
  const clusters = buildNarrativeClusters(xTrends, previousClusters);
  if (clusters.length === 0) return 0;

  for (const cluster of clusters) {
    await saveNarrativeClusterSnapshot(cluster);
  }

  let sentCount = 0;
  const strongClusters = getStrongNarrativeClusters(clusters).slice(0, 2);
  for (const cluster of strongClusters) {
    if (alertsSent + sentCount >= MAX_ALERTS_PER_SCAN) break;
    const alreadyAlerted = await wasClusterAlertedRecently(cluster.clusterId);
    if (alreadyAlerted && cluster.lifecycleState !== "reigniting") {
      console.log(`   ⏭️  Narrative cluster already alerted: ${cluster.canonicalEntity}`);
      continue;
    }
    const sent = await sendNarrativeClusterAlert(cluster);
    if (sent) {
      sentCount++;
      await recordClusterAlert(cluster);
      await sleep(DELAY_BETWEEN_ALERTS_MS);
    }
  }

  return sentCount;
}

// ----------------------------------------------------------
// DIGEST — post top trends summary every 3 hours
// ----------------------------------------------------------

async function runDigest() {
  console.log(`\n📊 RUNNING DIGEST — ${new Date().toISOString()}\n`);

  try {
    const trends = await fetchAllAttentionSources();
    if (trends.length === 0) {
      console.log("❌ No trends for digest");
      return;
    }

    // Score all non-noise trends
    const scored = [];
    for (const trend of trends) {
      if (isNoise(trend)) continue;
      const prevSnapshot = await getPreviousSnapshot(trend.id);
      applyXSnapshotPersistence(trend, prevSnapshot);
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
  ║    🐷 OINK                           ║
  ║    TikTok → Attention Markets       ║
  ╚══════════════════════════════════════╝
  `);

  console.log("🔧 Initializing...");
  initDB();
  const bot = initBot();

  bot.start({
    onStart: () => console.log("🤖 Telegram bot is online"),
  }).catch((err) => {
    console.error("⚠️  Telegram polling stopped:", err.message);
    console.error("   Alerts can still be sent; another bot process may already be polling commands.");
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

  await keepAlive();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keepAlive() {
  return new Promise(() => {});
}

function formatParticipation(trend) {
  if (trend.sourcePlatform === "x") {
    return `${(trend.engagementCount || 0).toLocaleString()} engagements`;
  }
  return `${(trend.videoCount || 0).toLocaleString()} videos`;
}

function logXPropagationSnapshot(trend) {
  console.log(
    `   🧬 X propagation: shape=${trend.viralShape} momentum=${trend.momentumTrend} ` +
    `lane=${trend.discoveryLane} attention=${Math.round(trend.attentionMomentum || 0).toLocaleString()} ` +
    `prop=${Number(trend.propagationRatio || 0).toFixed(3)} ` +
    `quoteExplosion=${trend.quoteExplosion ? "yes" : "no"} ` +
    `eng/follow=${Number(trend.engagementToFollowerRate || 0).toFixed(4)}`
  );
}

function logLaunchWorthiness(trend) {
  console.log(
    `   🧠 Launch worthiness: score=${trend.launchWorthinessScore}/100 ` +
    `archetype=${trend.marketArchetype} halfLife=${trend.narrativeHalfLifeEstimate} ` +
    `remix=${trend.remixabilityLabel} community=${trend.communityFormationLabel} ` +
    `copycatSwarm=${trend.copycatSwarm ? "yes" : "no"} recommendation=${trend.launchRecommendation}`
  );
}

process.on("SIGINT", () => { console.log("\n👋 Shutting down OINK..."); process.exit(0); });
process.on("SIGTERM", () => { console.log("\n👋 Shutting down OINK..."); process.exit(0); });

main().catch(console.error);
