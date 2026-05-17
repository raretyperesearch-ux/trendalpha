import { config } from "./config.js";

const DEFAULT_GENERIC_ARCHETYPE_WINDOW_HOURS = 6;

export class LaunchSaturationSafety {
  constructor(options = {}) {
    this.globalDisabled = options.globalDisabled ?? config.launch.globalDisable;
    this.maxLaunchesPerHour = Number(options.maxLaunchesPerHour ?? config.launch.maxLaunchesPerHour);
    this.sameNarrativeWindowHours = Number(options.sameNarrativeWindowHours ?? config.launch.sameNarrativeWindowHours);
    this.tickerCooldownHours = Number(options.tickerCooldownHours ?? config.launch.tickerCooldownHours);
    this.repeatedArchetypeWindowHours = Number(options.repeatedArchetypeWindowHours ?? DEFAULT_GENERIC_ARCHETYPE_WINDOW_HOURS);
    this.history = options.history || [];
  }

  evaluate(cluster = {}, shadowLaunch = null) {
    const warnings = [];
    const blocks = [];
    const ticker = normalizeTicker(shadowLaunch?.ticker || cluster.artifactSuggestedTicker || cluster.canonicalEntity || "");
    const narrativeKey = getNarrativeKey(cluster);
    const now = Date.now();

    if (this.globalDisabled) blocks.push("emergency_global_disable");
    if (countSince(this.history, now, 1) >= this.maxLaunchesPerHour) blocks.push("launch_per_hour_cap_reached");
    if (this.history.some((item) => item.clusterId && item.clusterId === cluster.clusterId)) blocks.push("cluster_duplicate_suppressed");
    if (this.history.some((item) => item.narrativeKey === narrativeKey && ageHours(item, now) <= this.sameNarrativeWindowHours)) {
      blocks.push("same_narrative_suppression_window");
    }
    if (this.history.some((item) => normalizeTicker(item.ticker) === ticker && ageHours(item, now) <= this.tickerCooldownHours)) {
      blocks.push("ticker_collision_cooldown");
    }
    const archetypeCount = this.history.filter((item) =>
      item.archetype === (cluster.archetype || cluster.marketArchetype) &&
      ageHours(item, now) <= this.repeatedArchetypeWindowHours
    ).length;
    if (archetypeCount >= 2) warnings.push("repeated_archetype_pressure");

    const saturationScore = computeNarrativeSaturationScore(cluster, {
      duplicate: blocks.includes("cluster_duplicate_suppressed"),
      sameNarrative: blocks.includes("same_narrative_suppression_window"),
      tickerCooldown: blocks.includes("ticker_collision_cooldown"),
      archetypeCount,
    });
    const anomaly = detectDeploymentAnomaly(cluster, shadowLaunch);
    if (anomaly) warnings.push(anomaly);
    if (saturationScore >= 80) blocks.push("narrative_saturation_high");
    else if (saturationScore >= 60) warnings.push("narrative_saturation_moderate");

    return {
      allowed: blocks.length === 0,
      blocks,
      warnings,
      saturationScore,
      ticker,
      narrativeKey,
      launchOpportunityPenalty: Math.min(30, Math.round(saturationScore * 0.25)),
    };
  }
}

export function evaluateLaunchSaturationSafety(input = {}) {
  return new LaunchSaturationSafety(input).evaluate(input.cluster, input.shadowLaunch);
}

export function computeNarrativeSaturationScore(cluster = {}, pressure = {}) {
  let score = Number(cluster.saturationPressure || 0) * 0.45 + Number(cluster.swarmPressure || 0) * 0.25;
  if (cluster.copycatSwarm) score += 18;
  if (pressure.duplicate) score += 22;
  if (pressure.sameNarrative) score += 20;
  if (pressure.tickerCooldown) score += 16;
  score += Math.min(18, Number(pressure.archetypeCount || 0) * 7);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function detectDeploymentAnomaly(cluster = {}, shadowLaunch = null) {
  if (!shadowLaunch?.ticker) return "missing_ticker";
  if (String(shadowLaunch.ticker).length < 3) return "ticker_too_short_anomaly";
  if ((cluster.launchReadiness || 0) < 70 && (cluster.swarmPressure || 0) > 50) return "low_readiness_high_swarm_anomaly";
  if ((cluster.saturationPressure || 0) > 75 && (cluster.launchReadiness || 0) > 85) return "high_readiness_high_saturation_anomaly";
  return null;
}

export function formatSaturationWarning(result = {}) {
  if (result.allowed && !result.warnings?.length) return "";
  const issues = [...(result.blocks || []), ...(result.warnings || [])].join(", ");
  return `Saturation safety: ${issues || "review recommended"} (${result.saturationScore || 0}/100)`;
}

function getNarrativeKey(cluster = {}) {
  return String(cluster.canonicalEntity || cluster.clusterName || cluster.clusterId || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countSince(history, now, hours) {
  return history.filter((item) => ageHours(item, now) <= hours).length;
}

function ageHours(item, now) {
  const timestamp = new Date(item.createdAt || item.created_at || 0).getTime();
  return (now - timestamp) / 3600000;
}

function normalizeTicker(value = "") {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}
