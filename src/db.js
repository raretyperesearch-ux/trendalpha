// ============================================================
// DATABASE (SUPABASE)
// ============================================================
// Stores trend snapshots and alerts for:
//   1. Deduplication — don't alert the same trend twice
//   2. Acceleration — compare current vs previous snapshot
//   3. Hit rate tracking — did our alerts actually lead to gains?
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { NarrativeMemoryService } from "./narrativeMemoryService.js";

let supabase = null;
const narrativeMemory = new NarrativeMemoryService();
let warnedMissingNarrativeTable = false;
let warnedMissingShadowLaunchTable = false;

/**
 * Initialize Supabase client
 */
export function initDB() {
  supabase = createClient(config.supabase.url, config.supabase.key);
  console.log("🗄️  Database connected");
  return supabase;
}

// ----------------------------------------------------------
// TREND SNAPSHOTS — track trends over time
// ----------------------------------------------------------

/**
 * Save a snapshot of a trend (called every scan)
 */
export async function saveTrendSnapshot(trend, score) {
  try {
    const snapshot = {
      trend_id: trend.id,
      trend_name: trend.name,
      trend_type: getSnapshotTrendType(trend),
      total_views: intValue(trend.totalViews),
      video_count: intValue(trend.videoCount),
      views_per_hour: intValue(score.metrics.viewsPerHour),
      score: intValue(score.total),
      score_breakdown: buildScoreBreakdown(score, trend),
      scanned_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("trend_snapshots").insert(snapshot);

    if (error) throw error;
  } catch (err) {
    console.error("❌ Failed to save snapshot:", err.message);
    await saveMinimalTrendSnapshot(trend, score);
  }
}

async function saveMinimalTrendSnapshot(trend, score) {
  try {
    const { error } = await supabase.from("trend_snapshots").insert({
      trend_id: String(trend.id || "").slice(0, 128),
      trend_name: String(trend.name || "Unknown").slice(0, 255),
      trend_type: getSnapshotTrendType(trend),
      total_views: intValue(trend.totalViews),
      video_count: intValue(trend.videoCount),
      views_per_hour: intValue(score.metrics.viewsPerHour),
      score: intValue(score.total),
      scanned_at: new Date().toISOString(),
    });

    if (error) throw error;
    console.log("   ✅ Saved minimal trend snapshot fallback");
  } catch (err) {
    console.error("❌ Minimal snapshot fallback failed:", err.message);
  }
}

function getSnapshotTrendType(trend) {
  if (trend.type === "song") return "song";
  return "hashtag";
}

function buildScoreBreakdown(score, trend) {
  const breakdown = { ...(score.breakdown || {}) };
  if (trend.sourcePlatform === "x") {
    breakdown.x = {
      attentionMomentum: intValue(trend.attentionMomentum),
      shareVelocity: intValue(trend.shareVelocity),
      quoteVelocity: intValue(trend.quoteVelocity),
      repostVelocity: intValue(trend.repostVelocity),
      engagementAcceleration: intValue(trend.engagementAcceleration),
      attentionShapeScore: intValue(trend.attentionShapeScore),
      propagationRatio: Number(trend.propagationRatio || 0),
      quoteToLikeRate: Number(trend.quoteToLikeRate || 0),
      viralShape: trend.viralShape || "unknown",
      momentumTrend: trend.momentumTrend || "stable",
      launchWorthinessScore: intValue(trend.launchWorthinessScore),
      launchRecommendation: trend.launchRecommendation || "WATCH",
      narrativePhase: trend.narrativePhase || "emerging",
      launchReadiness: intValue(trend.launchReadiness),
      saturationPressure: intValue(trend.saturationPressure),
      swarmPressure: intValue(trend.swarmPressure),
      phaseRecommendation: trend.phaseRecommendation || null,
      launchWindow: trend.launchWindow || null,
      idealLaunchTiming: trend.idealLaunchTiming || null,
      adaptiveLaunchThreshold: intValue(trend.adaptiveLaunchThreshold),
      accelerationSlope: intValue(trend.accelerationSlope),
      momentumPersistence: intValue(trend.momentumPersistence),
      quoteChainExpansion: intValue(trend.quoteChainExpansion),
      propagationHalfLife: trend.propagationHalfLife || null,
      remixGrowthRate: intValue(trend.remixGrowthRate),
      crossCommunityBreakoutTiming: trend.crossCommunityBreakoutTiming || null,
      accelerationInflectionPoint: trend.accelerationInflectionPoint || null,
      missedWindow: Boolean(trend.missedWindow),
      earlyConviction: Boolean(trend.earlyConviction),
      marketArchetype: trend.marketArchetype || "trendwave",
      narrativeHalfLifeEstimate: trend.narrativeHalfLifeEstimate || "flash trend",
      copycatSwarm: Boolean(trend.copycatSwarm),
    };
  }
  return breakdown;
}

/**
 * Get the previous snapshot for a trend (for acceleration calc)
 */
export async function getPreviousSnapshot(trendId) {
  try {
    const { data, error } = await supabase
      .from("trend_snapshots")
      .select("*")
      .eq("trend_id", trendId)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      viewsPerHour: data.views_per_hour,
      videoCount: data.video_count,
      score: data.score,
      scannedAt: data.scanned_at,
      x: data.score_breakdown?.x || null,
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// NARRATIVE CLUSTERS — optional persistence memory
// ----------------------------------------------------------

export async function saveNarrativeClusterSnapshot(cluster) {
  if (!supabase || !cluster?.clusterId) return false;

  const row = narrativeMemory.buildSnapshotRow(cluster);
  try {
    const { error } = await supabase.from("narrative_cluster_snapshots").insert(row);

    if (error) throw error;
    return true;
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingNarrativeTable();
      return saveNarrativeClusterFallback(cluster);
    }
    console.error("❌ Failed to save narrative cluster snapshot:", err.message);
    console.error("   Rejected narrative fields:", JSON.stringify(narrativeMemory.getRejectedFieldDiagnostics(row)));
    return retryMinimalNarrativeClusterInsert(cluster);
  }
}

export async function getRecentNarrativeClusterSnapshots(hours = 72) {
  if (!supabase) return [];

  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data, error } = await supabase
      .from("narrative_cluster_snapshots")
      .select("*")
      .gte("timestamp", since)
      .order("timestamp", { ascending: false })
      .limit(250);

    if (error) throw error;
    return narrativeMemory.normalizeHistoryRows(data || []);
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingNarrativeTable();
    } else {
      console.error("❌ Failed to load narrative cluster snapshots:", err.message);
    }
    return getRecentNarrativeClusterSnapshotsFallback(hours);
  }
}

async function retryMinimalNarrativeClusterInsert(cluster) {
  try {
    const minimal = narrativeMemory.buildMinimalSnapshotRow(cluster);
    const { error } = await supabase.from("narrative_cluster_snapshots").insert(minimal);
    if (error) throw error;
    console.log("   ✅ Saved minimal narrative cluster snapshot");
    return true;
  } catch (err) {
    if (isMissingTableError(err)) warnMissingNarrativeTable();
    else console.error("❌ Minimal narrative cluster insert failed:", err.message);
    return saveNarrativeClusterFallback(cluster);
  }
}

async function saveNarrativeClusterFallback(cluster) {
  try {
    const snapshot = narrativeMemory.buildSnapshotRow(cluster).snapshot;
    const { error } = await supabase.from("trend_snapshots").insert({
      trend_id: `cluster:${String(cluster.clusterId || "").slice(0, 118)}`,
      trend_name: String(cluster.canonicalEntity || "Narrative Cluster").slice(0, 255),
      trend_type: "hashtag",
      total_views: intValue(cluster.totalAttention),
      video_count: intValue(cluster.relatedPosts?.length),
      views_per_hour: intValue(average(cluster.relatedPosts?.map((post) => post.shareVelocity) || [])),
      score: intValue(cluster.launchReadiness || cluster.launchWorthinessScore),
      score_breakdown: { narrativeCluster: snapshot },
      scanned_at: new Date().toISOString(),
    });

    if (error) throw error;
    console.log("   ✅ Saved narrative cluster snapshot via trend_snapshots fallback");
    return true;
  } catch (err) {
    console.error("❌ Narrative cluster fallback failed:", err.message);
    return false;
  }
}

async function getRecentNarrativeClusterSnapshotsFallback(hours) {
  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data, error } = await supabase
      .from("trend_snapshots")
      .select("*")
      .like("trend_id", "cluster:%")
      .gte("scanned_at", since)
      .order("scanned_at", { ascending: false })
      .limit(250);

    if (error) throw error;
    return narrativeMemory.normalizeHistoryRows(data || []);
  } catch (err) {
    console.error("❌ Narrative cluster fallback load failed:", err.message);
    return [];
  }
}

export async function wasClusterAlertedRecently(clusterId) {
  return wasAlertedRecently(`cluster:${clusterId}`);
}

export async function recordClusterAlert(cluster) {
  if (!cluster?.clusterId) return false;
  return recordAlert(
    {
      id: `cluster:${cluster.clusterId}`,
      name: cluster.canonicalEntity,
    },
    {
      total: cluster.launchWorthinessScore,
    },
    null
  );
}

// ----------------------------------------------------------
// SHADOW LAUNCHES — dry-run deployment metadata only
// ----------------------------------------------------------

export async function saveShadowLaunch(shadowLaunch) {
  if (!supabase || !shadowLaunch?.launchId) return false;

  const row = {
    launch_id: String(shadowLaunch.launchId).slice(0, 180),
    cluster_id: String(shadowLaunch.clusterId || "").slice(0, 160),
    ticker: String(shadowLaunch.ticker || "").slice(0, 16),
    title: String(shadowLaunch.title || "").slice(0, 255),
    launch_readiness: intValue(shadowLaunch.launchReadiness),
    narrative_phase: String(shadowLaunch.narrativePhase || "forming").slice(0, 40),
    swarm_pressure: intValue(shadowLaunch.swarmPressure),
    identity_strength: intValue(shadowLaunch.identityStrength),
    launch_reasoning: shadowLaunch.launchReasoning || [],
    payload: shadowLaunch.payload || {},
    lifecycle_state: shadowLaunch.payload?.lifecycleState || "simulated",
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from("shadow_launches").insert(row);
    if (error) throw error;
    return true;
  } catch (err) {
    if (isMissingTableError(err)) {
      warnMissingShadowLaunchTable();
      return saveShadowLaunchFallback(shadowLaunch);
    }
    console.error("❌ Failed to save shadow launch:", err.message);
    console.error("   Rejected shadow launch:", JSON.stringify(getFieldDiagnostics(row)));
    return saveShadowLaunchFallback(shadowLaunch);
  }
}

export async function getRecentShadowLaunchTickers(hours = 72) {
  if (!supabase) return [];

  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data, error } = await supabase
      .from("shadow_launches")
      .select("ticker")
      .gte("created_at", since)
      .limit(500);
    if (error) throw error;
    return (data || []).map((row) => row.ticker).filter(Boolean);
  } catch (err) {
    if (isMissingTableError(err)) warnMissingShadowLaunchTable();
    else console.error("❌ Failed to load shadow launch tickers:", err.message);
    return [];
  }
}

export async function wasShadowLaunchPreparedRecently(clusterId, hours = 24) {
  if (!supabase || !clusterId) return false;

  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data, error } = await supabase
      .from("shadow_launches")
      .select("launch_id")
      .eq("cluster_id", clusterId)
      .gte("created_at", since)
      .limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  } catch (err) {
    if (isMissingTableError(err)) warnMissingShadowLaunchTable();
    else console.error("❌ Shadow launch dedupe check failed:", err.message);
    return false;
  }
}

async function saveShadowLaunchFallback(shadowLaunch) {
  try {
    const { error } = await supabase.from("trend_snapshots").insert({
      trend_id: `shadow:${String(shadowLaunch.launchId || "").slice(0, 120)}`,
      trend_name: String(shadowLaunch.title || "Shadow Launch").slice(0, 255),
      trend_type: "hashtag",
      total_views: intValue(shadowLaunch.payload?.narrative?.launchReadiness),
      video_count: 0,
      views_per_hour: 0,
      score: intValue(shadowLaunch.launchReadiness),
      score_breakdown: { shadowLaunch },
      scanned_at: new Date().toISOString(),
    });
    if (error) throw error;
    console.log("   ✅ Saved shadow launch via trend_snapshots fallback");
    return true;
  } catch (err) {
    console.error("❌ Shadow launch fallback failed:", err.message);
    return false;
  }
}

// ----------------------------------------------------------
// ALERTS — track what we've sent
// ----------------------------------------------------------

/**
 * Check if we've already alerted for this trend recently
 * (prevents spam — only alert once per trend per 24 hours)
 */
export async function wasAlertedRecently(trendId) {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000).toISOString();

    const { data, error } = await supabase
      .from("alerts_sent")
      .select("id")
      .eq("trend_id", trendId)
      .gte("sent_at", twentyFourHoursAgo)
      .limit(1);

    if (error) throw error;
    return data && data.length > 0;
  } catch (err) {
    console.error("❌ Alert check failed:", err.message);
    return false; // fail open — better to send a dupe than miss an alert
  }
}

/**
 * Record that we sent an alert
 */
export async function recordAlert(trend, score, token) {
  try {
    const canonicalToken = token?.matchStatus === "canonical" ? token : null;
    const { error } = await supabase.from("alerts_sent").insert({
      trend_id: trend.id,
      trend_name: trend.name,
      score: intValue(score.total),
      token_found: !!canonicalToken,
      token_name: canonicalToken?.tokenName || null,
      token_address: canonicalToken?.tokenAddress || null,
      token_chain: canonicalToken?.chain || null,
      token_price_at_alert: canonicalToken?.priceUsd || null,
      token_mcap_at_alert: canonicalToken?.marketCap ? intValue(canonicalToken.marketCap) : null,
      sent_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (err) {
    console.error("❌ Failed to record alert:", err.message);
  }
}

/**
 * Get the score from the last alert sent for this trend
 * Used for re-alert on big jumps
 */
export async function getLastAlertScore(trendId) {
  try {
    const { data, error } = await supabase
      .from("alerts_sent")
      .select("score")
      .eq("trend_id", trendId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.score;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// HIT RATE — track performance over time
// ----------------------------------------------------------

/**
 * Get hit rate stats (called for weekly reports)
 * A "hit" = token price went up 50%+ within 24h of alert
 */
export async function getHitRateStats(days = 7) {
  try {
    const since = new Date(
      Date.now() - days * 24 * 3600000
    ).toISOString();

    const { data, error } = await supabase
      .from("alerts_sent")
      .select("*")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });

    if (error) throw error;

    const total = data?.length || 0;
    const withToken = data?.filter((a) => a.token_found).length || 0;
    const hits = data?.filter((a) => a.was_hit === true).length || 0;

    return {
      totalAlerts: total,
      alertsWithToken: withToken,
      alertsNoToken: total - withToken,
      confirmedHits: hits,
      hitRate: total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A",
    };
  } catch (err) {
    console.error("❌ Failed to get hit rate:", err.message);
    return null;
  }
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function intValue(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

function isMissingTableError(err) {
  const message = String(err?.message || "");
  const code = String(err?.code || "");
  return code === "42P01" || message.includes("Could not find the table") || message.includes("does not exist");
}

function warnMissingNarrativeTable() {
  if (warnedMissingNarrativeTable) return;
  warnedMissingNarrativeTable = true;
  console.warn("⚠️  narrative_cluster_snapshots table missing; using trend_snapshots fallback until Supabase migration is applied.");
}

function warnMissingShadowLaunchTable() {
  if (warnedMissingShadowLaunchTable) return;
  warnedMissingShadowLaunchTable = true;
  console.warn("⚠️  shadow_launches table missing; using trend_snapshots fallback until Supabase migration is applied.");
}

function getFieldDiagnostics(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      {
        type: Array.isArray(value) ? "array" : typeof value,
        value: typeof value === "object" && value !== null ? "[object]" : String(value).slice(0, 120),
      },
    ])
  );
}
