// ============================================================
// Test TikTok dry-run launch path compatibility
// Run: npm run test-tiktok-launch-path
// ============================================================

import { convertTikTokTrendToLaunchCluster, evaluateTikTokLaunchCandidate } from "../tiktokLaunchAdapter.js";
import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment } from "../launchers/pumpPortalProvider.js";
import { formatDryRunLaunchAlert } from "../telegram.js";

const trend = {
  id: "tiktok-banana-dog",
  sourcePlatform: "tiktok",
  name: "#BananaDog",
  type: "hashtag",
  totalViews: 9000000,
  viewsPerHour: 420000,
  videoCount: 4200,
  rank: 18,
  rankChange: 12,
  rankChangeType: 1,
  acceleration: 1.55,
  trendDirection: "rising",
  trendCurve: [{ value: 10 }, { value: 20 }, { value: 42 }, { value: 80 }],
  coverImage: "https://example.com/banana-dog.jpg",
  coverWidth: 1000,
  coverHeight: 800,
  sourceUrl: "https://www.tiktok.com/tag/bananadog",
};

const evaluation = evaluateTikTokLaunchCandidate(trend);
const cluster = convertTikTokTrendToLaunchCluster(trend);
const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deployment = preparePumpPortalDeployment(shadowLaunch);
const telegram = formatDryRunLaunchAlert(shadowLaunch);

console.log("TikTok launch path test");
console.log(`Qualified: ${evaluation.qualified ? "yes" : "no"}`);
console.log(`Cluster: ${cluster.clusterId} ${cluster.launchReadiness}/100`);
console.log(`Shadow: ${shadowLaunch.title} ($${shadowLaunch.ticker})`);
console.log(`Identity ready: ${shadowLaunch.identity.ready ? "yes" : "no"}`);
console.log(`Image source: ${shadowLaunch.payload.sourceMediaType || shadowLaunch.payload.metadata?.imageUpload?.imageSource || "none"}`);
console.log(`Deployment valid: ${deployment.validation.valid ? "yes" : "no"}`);
console.log(telegram);

if (!evaluation.qualified) process.exitCode = 1;
if (cluster.relatedPosts[0].sourcePlatform !== "tiktok") process.exitCode = 1;
if (!shadowLaunch.identity.ready) process.exitCode = 1;
if (shadowLaunch.payload.sourcePlatform !== "tiktok") process.exitCode = 1;
if (!telegram.includes("Source:\n<b>TikTok</b>")) process.exitCode = 1;
if (!deployment.payload.metadata.imageUpload.imageSource.includes("SOURCE") && deployment.payload.metadata.imageUpload.imageSource !== "TIKTOK COVER") process.exitCode = 1;
