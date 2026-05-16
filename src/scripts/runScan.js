// ============================================================
// Run a single scan manually (no cron loop)
// Run: npm run scan
// ============================================================

import { config } from "../config.js";
import { fetchAllAttentionSources } from "../providers/index.js";
import { applyXSnapshotPersistence } from "../providers/xProvider.js";
import { applyLaunchWorthiness } from "../launchWorthiness.js";
import { buildNarrativeClusters, getStrongNarrativeClusters } from "../narrativeClusters.js";
import { scoreTrend } from "../scoring.js";
import { scoreLaunchOpportunity } from "../launchScoring.js";
import { generateLaunchBrief } from "../launchBrief.js";
import { preparePumpFunLaunch } from "../launchers/pumpfun.js";
import { findToken } from "../tokens.js";
import { initBot, sendAlert, sendLaunchCandidate, sendNarrativeClusterAlert } from "../telegram.js";
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
} from "../db.js";

// ----------------------------------------------------------
// NOISE FILTER — skip trends that will never get tokenized
// ----------------------------------------------------------

// Generic/spam hashtags that always trend but aren't memeable
const SKIP_HASHTAGS = new Set([
  "home", "fyp", "foryou", "foryoupage", "viral", "trending",
  "fy", "fypシ", "100kviews", "greenscreen", "CapCut",
  // TikTok promotional
  "liveiseasy", "makefriendslive", "livewithlowfollowers", "livefest2025",
  "tiktoklivefest", "tiktoklive",
  // Too broad/generic
  "teamworkmakesthedreamwork", "sunsetvibes", "daytrading",
  "investing", "trading", "motivation", "love", "funny",
]);

// Non-English patterns — these rarely get tokenized in crypto
const NON_ENGLISH_PATTERNS = [
  /indosiar/i, /dangdut/i, /dacademy/i,     // Indonesian
  /berkelas/i, /berkualitas/i,
  /novela/i, /telenovela/i,                   // Spanish TV
  /bollywood/i, /hindi/i,                     // Indian
  /kpop/i, /kdrama/i,                         // Korean (unless very viral)
  /copadelrey/i,                              // Spanish sports
  /^#[a-z]{2}weather$/i,                      // Regional weather
];

/**
 * Check if a trend should be skipped (noise)
 */
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

  // Song-specific filters
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
// MAIN SCAN
// ----------------------------------------------------------

const MAX_ALERTS_PER_SCAN = 5;         // Don't spam the channel
const DELAY_BETWEEN_ALERTS_MS = 3000;  // 3 seconds between alerts

async function main() {
  console.log("📡 Running single scan...\n");

  initDB();
  initBot();

  const trends = await fetchAllAttentionSources();

  let alertsSent = 0;
  alertsSent += await processNarrativeClusters(trends, alertsSent);

  for (const trend of trends) {
    // Noise filter
    if (isNoise(trend)) {
      continue;
    }

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

    const earlyLaunchScore = config.launch.enableLaunchCandidates
      ? scoreLaunchOpportunity(trend, null, prevSnapshot)
      : null;
    const meetsThreshold = isNewEntry ? score.total >= 50 : score.total >= config.scan.minScore;
    const mayQualifyForLaunch = earlyLaunchScore?.total >= config.launch.minLaunchScore;
    if (meetsThreshold || mayQualifyForLaunch) {
      // Cap alerts per scan
      if (alertsSent >= MAX_ALERTS_PER_SCAN) {
        console.log(`   ⏸️  Max alerts (${MAX_ALERTS_PER_SCAN}) reached — skipping rest`);
        continue;
      }

      const alreadyAlerted = await wasAlertedRecently(trend.id);
      if (alreadyAlerted) {
        const lastScore = await getLastAlertScore(trend.id);
        if (lastScore !== null && score.total >= lastScore + 10) {
          console.log(`   🚀 Score jumped from ${lastScore} → ${score.total}! Re-alerting...`);
        } else {
          console.log(`   ⏭️  Already alerted — skipping`);
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

      // Delay between alerts to avoid Telegram rate limits
      if (alertsSent > 0) {
        console.log(`   ⏳ Waiting ${DELAY_BETWEEN_ALERTS_MS / 1000}s...`);
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
  }

  console.log(`\n✅ Scan complete — ${alertsSent} alerts sent`);
  process.exit(0);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

main().catch(console.error);
