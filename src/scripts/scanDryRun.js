// ============================================================
// Dry-run scan preview. Fetches enabled providers and prints
// what OINK would consider for Telegram without sending alerts.
// ============================================================

import { config } from "../config.js";
import { fetchAllAttentionSources } from "../providers/index.js";
import { scoreTrend } from "../scoring.js";
import { scoreLaunchOpportunity } from "../launchScoring.js";
import { generateLaunchBrief } from "../launchBrief.js";
import { formatCount } from "../tokens.js";

const MAX_PREVIEW = parseInt(process.env.DRY_RUN_LIMIT || "10", 10);

const trends = await fetchAllAttentionSources();

if (trends.length === 0) {
  console.log("No attention objects returned from enabled providers.");
  process.exit(0);
}

console.log(`OINK dry run: ${trends.length} attention objects fetched`);
console.log(`Showing top ${Math.min(MAX_PREVIEW, trends.length)}\n`);

for (const trend of trends.slice(0, MAX_PREVIEW)) {
  const trendScore = scoreTrend(trend);
  const launchScore = scoreLaunchOpportunity(trend, null, null);
  const launchBrief = generateLaunchBrief({
    trend,
    trendScore,
    launchScore,
    token: null,
  });
  const isLaunchCandidate = launchScore.total >= config.launch.minLaunchScore;

  console.log("=".repeat(80));
  console.log(`${trend.sourcePlatform === "x" ? "X" : "TikTok"}: ${trend.name}`);
  console.log(`Source: ${trend.sourceUrl || "n/a"}`);
  if (trend.sourcePlatform === "x") {
    console.log(`Author: @${trend.author}`);
    console.log(`Views/hr: ${formatCount(trend.viewsPerHour)} | Shares/hr: ${formatCount(trend.shareVelocity)} | Quotes: ${formatCount(trend.quoteCount)}`);
    console.log(`Attention Shape: ${formatCount(trend.attentionShapeScore)}`);
  } else {
    console.log(`Views/hr: ${formatCount(trendScore.metrics.viewsPerHour)} | Videos: ${formatCount(trend.videoCount)}`);
  }
  console.log(`Trend Score: ${trendScore.total}/100`);
  console.log(`Launch Score: ${launchScore.total}/100 (${launchScore.label})`);
  console.log(`Would Send: ${isLaunchCandidate ? "Launch candidate card" : "Regular attention alert if score threshold is met"}`);
  console.log(`Suggested Market: ${launchBrief.suggestedName} ($${launchBrief.suggestedTicker})`);
  console.log(`Narrative Tag: ${launchBrief.socialTag}`);
  if (launchBrief.xLaunchPost) {
    console.log("Suggested X Post:");
    console.log(launchBrief.xLaunchPost);
  }
  if (launchScore.riskFlags.length > 0) {
    console.log(`Risk Flags: ${launchScore.riskFlags.join(", ")}`);
  }
}
