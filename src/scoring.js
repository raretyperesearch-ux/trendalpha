// ============================================================
// SCORING ENGINE — v2 (Creative Center Data)
// ============================================================
// Recalibrated for real TikTok Creative Center metrics
//
// Score 0-100:
//   Views/hour velocity:  0-30 points
//   Video count:          0-30 points
//   Trend acceleration:   0-20 points
//   Rank momentum:        0-20 points
// ============================================================

import { getViewsPerHour, getHoursActive } from "./tiktok.js";

export function scoreTrend(trend, previousSnapshot = null) {
  const viewsPerHour = getViewsPerHour(trend);
  const hoursActive = getHoursActive(trend);
  const videoCount = trend.videoCount || 0;
  const engagementPerHour = trend.engagementPerHour || 0;

  // ---- VIEWS PER HOUR (0-30 pts) ----
  let velocityScore;
  if (viewsPerHour >= 2_000_000) velocityScore = 30;
  else if (viewsPerHour >= 1_000_000) velocityScore = 26;
  else if (viewsPerHour >= 500_000) velocityScore = 22;
  else if (viewsPerHour >= 200_000) velocityScore = 17;
  else if (viewsPerHour >= 100_000) velocityScore = 12;
  else if (viewsPerHour >= 50_000) velocityScore = 7;
  else velocityScore = Math.round((viewsPerHour / 50_000) * 7);
  if (trend.sourcePlatform === "x" && engagementPerHour > 0) {
    if (engagementPerHour >= 5_000) velocityScore = Math.max(velocityScore, 26);
    else if (engagementPerHour >= 2_500) velocityScore = Math.max(velocityScore, 22);
    else if (engagementPerHour >= 1_000) velocityScore = Math.max(velocityScore, 17);
    else if (engagementPerHour >= 500) velocityScore = Math.max(velocityScore, 12);
    if (trend.attentionMomentum >= 250_000) velocityScore = Math.max(velocityScore, 30);
    else if (trend.attentionMomentum >= 100_000) velocityScore = Math.max(velocityScore, 26);
    else if (trend.attentionMomentum >= 50_000) velocityScore = Math.max(velocityScore, 22);
    else if (trend.attentionMomentum >= 25_000) velocityScore = Math.max(velocityScore, 17);
  }

  // ---- VIDEO COUNT (0-30 pts) ----
  let videoScore;
  if (trend.sourcePlatform === "x") {
    const engagementCount = trend.engagementCount || 0;
    if (engagementCount >= 100_000) videoScore = 30;
    else if (engagementCount >= 50_000) videoScore = 26;
    else if (engagementCount >= 20_000) videoScore = 22;
    else if (engagementCount >= 10_000) videoScore = 17;
    else if (engagementCount >= 5_000) videoScore = 12;
    else if (engagementCount >= 2_000) videoScore = 7;
    else videoScore = Math.round((engagementCount / 2_000) * 7);
    if (trend.quoteExplosion) videoScore = Math.max(videoScore, 20);
    if (trend.marketabilityScore >= 70) videoScore = Math.max(videoScore, 22);
    else if (trend.marketabilityScore >= 50) videoScore = Math.max(videoScore, 17);
  } else if (videoCount >= 50_000) videoScore = 30;
  else if (videoCount >= 20_000) videoScore = 26;
  else if (videoCount >= 10_000) videoScore = 22;
  else if (videoCount >= 5_000) videoScore = 17;
  else if (videoCount >= 2_000) videoScore = 12;
  else if (videoCount >= 1_000) videoScore = 7;
  else videoScore = Math.round((videoCount / 1_000) * 7);

  // ---- TREND ACCELERATION (0-20 pts) ----
  let accelerationScore = 10;
  if (trend.acceleration) {
    if (trend.acceleration >= 1.5) accelerationScore = 20;
    else if (trend.acceleration >= 1.2) accelerationScore = 16;
    else if (trend.acceleration >= 1.05) accelerationScore = 12;
    else if (trend.acceleration >= 0.95) accelerationScore = 8;
    else if (trend.acceleration >= 0.8) accelerationScore = 4;
    else accelerationScore = 2;
  }
  if (trend.trendDirection === "rising") {
    accelerationScore = Math.max(accelerationScore, 14);
  } else if (trend.trendDirection === "falling") {
    accelerationScore = Math.min(accelerationScore, 6);
  }

  // ---- RANK MOMENTUM (0-20 pts) ----
  let rankScore = 10;
  if (trend.rankChange && trend.rankChangeType) {
    if (trend.rankChangeType === 3) rankScore = 20;        // NEW entry
    else if (trend.rankChangeType === 1) {                  // Moving UP
      if (trend.rankChange >= 20) rankScore = 18;
      else if (trend.rankChange >= 10) rankScore = 15;
      else if (trend.rankChange >= 5) rankScore = 12;
      else rankScore = 10;
    } else if (trend.rankChangeType === 2) rankScore = 4;   // Moving DOWN
    else rankScore = 8;                                      // Same
  }

  if (previousSnapshot) {
    const prevVPH = previousSnapshot.viewsPerHour || 0;
    if (prevVPH > 0) {
      const growth = viewsPerHour / prevVPH;
      if (growth >= 2) rankScore = Math.max(rankScore, 18);
      else if (growth >= 1.5) rankScore = Math.max(rankScore, 14);
    }
  }

  const totalScore = Math.min(100, velocityScore + videoScore + accelerationScore + rankScore);

  return {
    total: totalScore,
    breakdown: { velocity: velocityScore, videoCount: videoScore, acceleration: accelerationScore, rank: rankScore },
    metrics: { viewsPerHour, videoCount, engagementPerHour, hoursActive },
  };
}

export function getConviction(score) {
  if (score >= 85) return { label: "EXTREME", emoji: "🔴" };
  if (score >= 75) return { label: "HIGH", emoji: "🟠" };
  if (score >= 65) return { label: "MEDIUM", emoji: "🟡" };
  if (score >= 55) return { label: "LOW", emoji: "⚪" };
  return { label: "NOISE", emoji: "💤" };
}
