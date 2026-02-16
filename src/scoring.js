// ============================================================
// SCORING ENGINE
// ============================================================
// Two metrics that matter:
//   1. Views per hour — how fast is it blowing up?
//   2. Video count — how many creators jumped on it?
//
// NO AI OPINIONS. Just math. You're the meme brain.
// ============================================================

import { getViewsPerHour, getHoursActive } from "./tiktok.js";

/**
 * Score a trend from 0-100 based on viral signals
 *
 * Breakdown:
 *   - Views/hour velocity:  0-40 points
 *   - Video count:          0-40 points
 *   - Freshness bonus:      0-10 points (newer = better)
 *   - Acceleration bonus:   0-10 points (growing faster = better)
 */
export function scoreTrend(trend, previousSnapshot = null) {
  const viewsPerHour = getViewsPerHour(trend);
  const hoursActive = getHoursActive(trend);

  // ---- VIEWS PER HOUR (0-40 pts) ----
  // Thresholds based on what actually goes viral on TikTok:
  //   < 50K/hr  = meh
  //   50-200K   = heating up
  //   200-500K  = on fire
  //   500K-1M   = viral
  //   > 1M      = mega viral
  let velocityScore;
  if (viewsPerHour >= 1_000_000) velocityScore = 40;
  else if (viewsPerHour >= 500_000) velocityScore = 35;
  else if (viewsPerHour >= 200_000) velocityScore = 28;
  else if (viewsPerHour >= 100_000) velocityScore = 20;
  else if (viewsPerHour >= 50_000) velocityScore = 12;
  else if (viewsPerHour >= 20_000) velocityScore = 6;
  else velocityScore = Math.round((viewsPerHour / 20_000) * 6);

  // ---- VIDEO COUNT (0-40 pts) ----
  // How many creators are using this sound/trend:
  //   < 100     = just starting
  //   100-500   = gaining traction
  //   500-1000  = strong adoption
  //   1000-2000 = very strong
  //   > 2000    = massive
  let videoScore;
  if (trend.videoCount >= 2000) videoScore = 40;
  else if (trend.videoCount >= 1000) videoScore = 34;
  else if (trend.videoCount >= 500) videoScore = 26;
  else if (trend.videoCount >= 200) videoScore = 18;
  else if (trend.videoCount >= 100) videoScore = 10;
  else videoScore = Math.round((trend.videoCount / 100) * 10);

  // ---- FRESHNESS BONUS (0-10 pts) ----
  // Newer trends = more opportunity
  //   < 2 hrs = max bonus
  //   2-6 hrs = good
  //   6-12 hrs = ok
  //   > 12 hrs = stale
  let freshnessScore;
  if (hoursActive <= 2) freshnessScore = 10;
  else if (hoursActive <= 4) freshnessScore = 8;
  else if (hoursActive <= 6) freshnessScore = 6;
  else if (hoursActive <= 12) freshnessScore = 3;
  else freshnessScore = 1;

  // ---- ACCELERATION BONUS (0-10 pts) ----
  // If we have a previous snapshot, check if it's speeding up
  let accelerationScore = 5; // default neutral
  if (previousSnapshot) {
    const prevViewsPerHour = previousSnapshot.viewsPerHour || 0;
    const prevVideoCount = previousSnapshot.videoCount || 0;

    const viewsAccel = viewsPerHour / Math.max(1, prevViewsPerHour);
    const videoAccel = trend.videoCount / Math.max(1, prevVideoCount);

    // Growing 2x+ between scans = strong acceleration
    if (viewsAccel >= 2 && videoAccel >= 1.5) accelerationScore = 10;
    else if (viewsAccel >= 1.5 || videoAccel >= 1.3) accelerationScore = 7;
    else if (viewsAccel >= 1.1) accelerationScore = 5;
    else if (viewsAccel < 0.8) accelerationScore = 2; // slowing down
    else accelerationScore = 3; // flatting
  }

  const totalScore = Math.min(
    100,
    velocityScore + videoScore + freshnessScore + accelerationScore
  );

  return {
    total: totalScore,
    breakdown: {
      velocity: velocityScore,
      videoCount: videoScore,
      freshness: freshnessScore,
      acceleration: accelerationScore,
    },
    metrics: {
      viewsPerHour,
      videoCount: trend.videoCount,
      hoursActive,
    },
  };
}

/**
 * Get a human-readable conviction label
 */
export function getConviction(score) {
  if (score >= 90) return { label: "EXTREME", emoji: "🔴" };
  if (score >= 80) return { label: "HIGH", emoji: "🟠" };
  if (score >= 70) return { label: "MEDIUM", emoji: "🟡" };
  if (score >= 60) return { label: "LOW", emoji: "⚪" };
  return { label: "NOISE", emoji: "💤" };
}
