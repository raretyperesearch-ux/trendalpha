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
import { buildNarrativeClusters, getStrongNarrativeClusters } from "../narrativeClusters.js";
import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment } from "../launchers/pumpPortalProvider.js";
import { convertTikTokTrendToLaunchCluster, evaluateTikTokLaunchCandidate } from "../tiktokLaunchAdapter.js";

const MAX_PREVIEW = parseInt(process.env.DRY_RUN_LIMIT || "10", 10);

const trends = await fetchAllAttentionSources();

if (trends.length === 0) {
  console.log("No attention objects returned from enabled providers.");
  process.exit(0);
}

console.log(`OINK dry run: ${trends.length} attention objects fetched`);
console.log(`Showing top ${Math.min(MAX_PREVIEW, trends.length)}\n`);

const clusters = buildNarrativeClusters(trends);
const strongClusters = getStrongNarrativeClusters(clusters);
if (clusters.length > 0) {
  console.log("Narrative clusters:");
  for (const cluster of clusters.slice(0, 5)) {
    console.log(
      `- ${cluster.canonicalEntity}: ${cluster.lifecycleState} | ` +
      `${cluster.relatedPosts.length} posts | ${cluster.relatedAccounts.length} accounts | ` +
      `remix ${formatCount(cluster.remixCount)} | readiness ${cluster.launchReadiness}/100 | ` +
      `window ${cluster.launchWindow} | timing ${cluster.idealLaunchTiming} | ` +
      `saturation ${cluster.saturationPressure}/100 | ` +
      `${cluster.recommendation}`
    );
  }
  console.log(`Strong cluster alerts that would send: ${strongClusters.length}\n`);
  const tickers = [];
  for (const cluster of strongClusters.slice(0, 3)) {
    if (!qualifiesForDryRunLaunch(cluster)) continue;
    const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster, { existingTickers: tickers });
    tickers.push(shadowLaunch.ticker);
    console.log("Dry-run PumpPortal payload:");
    console.log(`- ${shadowLaunch.title} ($${shadowLaunch.ticker})`);
    console.log(`  Window: ${shadowLaunch.payload.launchTiming.idealLaunchWindow} | Timing: ${shadowLaunch.payload.launchTiming.idealLaunchTiming}`);
    console.log(`  Confidence: ${shadowLaunch.payload.launchConfidence}/100 | State: ${shadowLaunch.payload.lifecycleState}`);
    if (shadowLaunch.payload.sourceArtifactType) {
      console.log(`  Artifact: ${shadowLaunch.payload.sourceArtifactType} | strength ${shadowLaunch.payload.artifactStrength}/100 | visual ${shadowLaunch.payload.visualReuseMode}`);
    }
    const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, { existingTickers: tickers });
    console.log(`  PumpPortal: ${deploymentAttempt.mode} | ${deploymentAttempt.deploymentState} | valid ${deploymentAttempt.validation.valid ? "yes" : "no"}`);
    if (deploymentAttempt.validation.errors.length > 0) {
      console.log(`  Deployment Errors: ${deploymentAttempt.validation.errors.join(", ")}`);
    }
    console.log(`  X Draft: ${shadowLaunch.payload.socialPostDraft.x.split("\n").join(" / ")}`);
  }
  if (strongClusters.length > 0) console.log("");
}

for (const trend of trends.slice(0, MAX_PREVIEW)) {
  const trendScore = scoreTrend(trend);
  const launchScore = scoreLaunchOpportunity(trend, null, null);
  const launchBrief = generateLaunchBrief({
    trend,
    trendScore,
    launchScore,
    token: null,
  });
  const isLaunchCandidate = qualifiesForLaunchReview(launchScore);

  console.log("=".repeat(80));
  console.log(`${trend.sourcePlatform === "x" ? "X" : "TikTok"}: ${trend.name}`);
  console.log(`Source: ${trend.sourceUrl || "n/a"}`);
  if (trend.sourcePlatform === "x") {
    console.log(`Author: @${trend.author}`);
    console.log(`Views/hr: ${formatCount(trend.viewsPerHour)} | Shares/hr: ${formatCount(trend.shareVelocity)} | Quotes: ${formatCount(trend.quoteCount)}`);
    console.log(`Viral Shape: ${trend.viralShape} | Momentum: ${trend.momentumTrend} | Lane: ${trend.discoveryLane}`);
    console.log(`Narrative Phase: ${trend.narrativePhase} | Launch Readiness: ${trend.launchReadiness}/100 | Saturation: ${trend.saturationPressure}/100`);
    console.log(`Launch Window: ${trend.launchWindow} | Timing: ${trend.idealLaunchTiming} | Adaptive Threshold: ${trend.adaptiveLaunchThreshold}`);
    console.log(`Acceleration Slope: ${trend.accelerationSlope}/100 | Quote Expansion: ${trend.quoteChainExpansion}/100 | Remix Growth: ${trend.remixGrowthRate}/100`);
    console.log(`Cross-Community: ${trend.crossCommunityTrend} | Breakout Timing: ${trend.crossCommunityBreakoutTiming} | Swarm Pressure: ${trend.swarmPressure}/100 | Phase Rec: ${trend.phaseRecommendation}`);
    console.log(`Attention Momentum: ${formatCount(trend.attentionMomentum)} | Shape: ${formatCount(trend.attentionShapeScore)}`);
    console.log(`Quote Explosion: ${trend.quoteExplosion ? "yes" : "no"} | Propagation Ratio: ${Number(trend.propagationRatio || 0).toFixed(3)}`);
    console.log(`Launch Worthiness: ${trend.launchWorthinessScore}/100 | Archetype: ${trend.marketArchetype} | Recommendation: ${trend.launchRecommendation}`);
  } else {
    console.log(`Views/hr: ${formatCount(trendScore.metrics.viewsPerHour)} | Videos: ${formatCount(trend.videoCount)}`);
    const tiktokEval = evaluateTikTokLaunchCandidate(trend);
    console.log(`TikTok Dry-Run: ${tiktokEval.qualified ? "qualified" : "rejected"} | readiness ${tiktokEval.metrics.launchReadiness}/100 | identity ${tiktokEval.metrics.memeticIdentityScore}/100`);
    if (tiktokEval.qualified) {
      const cluster = convertTikTokTrendToLaunchCluster(tiktokEval.trend);
      const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
      console.log(`TikTok PumpPortal: ${shadowLaunch.title} ($${shadowLaunch.ticker}) | image ${shadowLaunch.payload.sourceMediaType || shadowLaunch.payload.visualReuseMode}`);
    } else if (tiktokEval.rejections.length > 0) {
      console.log(`TikTok Reject: ${tiktokEval.rejections.slice(0, 4).join(", ")}`);
    }
  }
  console.log(`Trend Score: ${trendScore.total}/100`);
  console.log(`Launch Score: ${launchScore.total}/100 (${launchScore.label})`);
  if (launchScore.narrativePhase) {
    console.log(`Phase: ${launchScore.narrativePhase} | Readiness: ${launchScore.launchReadiness}/100 | Rec: ${launchScore.phaseRecommendation}`);
  }
  console.log(`Would Send: ${isLaunchCandidate ? "Launch candidate card" : "Regular attention alert if score threshold is met"}`);
  console.log(`Suggested Market: ${launchBrief.suggestedName} ($${launchBrief.suggestedTicker})`);
  if (trend.memeticArtifact) {
    console.log(`Artifact: ${trend.memeticArtifact.artifactType} | strength ${trend.memeticArtifact.artifactStrength}/100 | visual ${trend.memeticArtifact.visualReuseMode}`);
    console.log(`Identity Compression: ${trend.memeticArtifact.identityCompressionSummary}`);
  }
  console.log(`Narrative Tag: ${launchBrief.socialTag}`);
  if (launchBrief.xLaunchPost) {
    console.log("Suggested X Post:");
    console.log(launchBrief.xLaunchPost);
  }
  if (launchScore.riskFlags.length > 0) {
    console.log(`Risk Flags: ${launchScore.riskFlags.join(", ")}`);
  }
}

function qualifiesForLaunchReview(launchScore) {
  if (!launchScore) return false;
  if (launchScore.phaseRecommendation === "DO_NOT_LAUNCH") return false;
  if (launchScore.narrativePhase === "saturated" || launchScore.narrativePhase === "decaying") return false;
  if (launchScore.launchWindow === "SATURATED" || launchScore.launchWindow === "LATE_STAGE") return false;
  if (launchScore.launchWindow === "PRIME_WINDOW") return launchScore.launchReadiness >= (launchScore.adaptiveLaunchThreshold || 75);
  if (launchScore.launchWindow === "FORMING_WINDOW") return launchScore.launchReadiness >= Math.min(75, launchScore.adaptiveLaunchThreshold || 75);
  if (["PREPARE_LAUNCH", "HIGH_CONVICTION", "BREAKOUT_FORMING"].includes(launchScore.phaseRecommendation)) {
    return launchScore.launchReadiness >= 75 || launchScore.total >= 75;
  }
  return launchScore.total >= config.launch.minLaunchScore;
}

function qualifiesForDryRunLaunch(cluster) {
  if (!cluster) return false;
  if (cluster.launchWindow === "SATURATED" || cluster.launchWindow === "LATE_STAGE") return false;
  if ((cluster.swarmPressure || 0) >= 65) return false;
  if ((cluster.saturationPressure || 0) >= 72) return false;
  return (
    (cluster.launchWindow === "PRIME_WINDOW" && (cluster.launchReadiness || 0) >= 75) ||
    (cluster.launchWindow === "FORMING_WINDOW" && (cluster.launchReadiness || 0) >= 72) ||
    (cluster.earlyConviction && (cluster.launchReadiness || 0) >= 70)
  );
}
