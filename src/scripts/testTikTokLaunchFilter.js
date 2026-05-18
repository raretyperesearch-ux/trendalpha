// ============================================================
// Test strict TikTok launch filtering
// Run: npm run test-tiktok-launch-filter
// ============================================================

import { evaluateTikTokLaunchCandidate } from "../tiktokLaunchAdapter.js";

const good = mockTrend();
const generic = { ...mockTrend(), id: "bad-generic", name: "#fyp", viewsPerHour: 600000 };
const saturated = { ...mockTrend(), id: "bad-saturated", videoCount: 75000, totalViews: 900000000, viewsPerHour: 2200000 };
const falling = { ...mockTrend(), id: "bad-falling", trendDirection: "falling" };
const canonicalToken = { matchStatus: "canonical", tokenName: "Banana Dog" };

const goodEval = evaluateTikTokLaunchCandidate(good);
const genericEval = evaluateTikTokLaunchCandidate(generic);
const saturatedEval = evaluateTikTokLaunchCandidate(saturated);
const fallingEval = evaluateTikTokLaunchCandidate(falling);
const tokenEval = evaluateTikTokLaunchCandidate(good, { token: canonicalToken });

console.log("TikTok launch filter test");
console.log(`Good qualified: ${goodEval.qualified ? "yes" : "no"} readiness=${goodEval.metrics.launchReadiness} identity=${goodEval.metrics.memeticIdentityScore}`);
console.log(`Generic rejected: ${genericEval.rejections.join(", ")}`);
console.log(`Saturated rejected: ${saturatedEval.rejections.join(", ")}`);
console.log(`Falling rejected: ${fallingEval.rejections.join(", ")}`);
console.log(`Canonical token rejected: ${tokenEval.rejections.join(", ")}`);

if (!goodEval.qualified) process.exitCode = 1;
if (!genericEval.rejections.includes("generic_or_broad_hashtag")) process.exitCode = 1;
if (!saturatedEval.rejections.includes("tiktok_saturation_pressure_high")) process.exitCode = 1;
if (!fallingEval.rejections.includes("trend_falling")) process.exitCode = 1;
if (!tokenEval.rejections.includes("canonical_market_already_exists")) process.exitCode = 1;

function mockTrend() {
  return {
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
}
