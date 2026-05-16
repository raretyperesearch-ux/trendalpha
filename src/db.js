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
import { serializeNarrativeCluster } from "./narrativeClusters.js";

let supabase = null;

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
      total_views: Number(trend.totalViews || 0),
      video_count: Number(trend.videoCount || 0),
      views_per_hour: score.metrics.viewsPerHour,
      score: score.total,
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
      total_views: Number(trend.totalViews || 0),
      video_count: Number(trend.videoCount || 0),
      views_per_hour: Number(score.metrics.viewsPerHour || 0),
      score: Number(score.total || 0),
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
      attentionMomentum: Number(trend.attentionMomentum || 0),
      shareVelocity: Number(trend.shareVelocity || 0),
      quoteVelocity: Number(trend.quoteVelocity || 0),
      repostVelocity: Number(trend.repostVelocity || 0),
      engagementAcceleration: Number(trend.engagementAcceleration || 0),
      attentionShapeScore: Number(trend.attentionShapeScore || 0),
      propagationRatio: Number(trend.propagationRatio || 0),
      quoteToLikeRate: Number(trend.quoteToLikeRate || 0),
      viralShape: trend.viralShape || "unknown",
      momentumTrend: trend.momentumTrend || "stable",
      launchWorthinessScore: Number(trend.launchWorthinessScore || 0),
      launchRecommendation: trend.launchRecommendation || "WATCH",
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

  try {
    const snapshot = serializeNarrativeCluster(cluster);
    const avgShareVelocity = average(cluster.relatedPosts?.map((post) => post.shareVelocity) || []);
    const avgQuoteVelocity = average(cluster.relatedPosts?.map((post) => post.quoteVelocity) || []);

    const { error } = await supabase.from("narrative_cluster_snapshots").insert({
      cluster_id: cluster.clusterId,
      canonical_entity: cluster.canonicalEntity,
      archetype: cluster.archetype,
      lifecycle_state: cluster.lifecycleState,
      total_attention: Number(cluster.totalAttention || 0),
      total_momentum: Number(cluster.totalMomentum || 0),
      propagation_persistence: Number(cluster.propagationPersistence || 0),
      community_spread_score: Number(cluster.communitySpreadScore || 0),
      launch_worthiness_score: Number(cluster.launchWorthinessScore || 0),
      recommendation: cluster.recommendation,
      avg_share_velocity: avgShareVelocity,
      avg_quote_velocity: avgQuoteVelocity,
      snapshot,
      scanned_at: new Date().toISOString(),
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("❌ Failed to save narrative cluster snapshot:", err.message);
    return saveNarrativeClusterFallback(cluster);
  }
}

export async function getRecentNarrativeClusterSnapshots(hours = 72) {
  if (!supabase) return [];

  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const { data, error } = await supabase
      .from("narrative_cluster_snapshots")
      .select("*")
      .gte("scanned_at", since)
      .order("scanned_at", { ascending: false })
      .limit(250);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("❌ Failed to load narrative cluster snapshots:", err.message);
    return getRecentNarrativeClusterSnapshotsFallback(hours);
  }
}

async function saveNarrativeClusterFallback(cluster) {
  try {
    const snapshot = serializeNarrativeCluster(cluster);
    const { error } = await supabase.from("trend_snapshots").insert({
      trend_id: `cluster:${String(cluster.clusterId || "").slice(0, 118)}`,
      trend_name: String(cluster.canonicalEntity || "Narrative Cluster").slice(0, 255),
      trend_type: "hashtag",
      total_views: Number(cluster.totalAttention || 0),
      video_count: Number(cluster.relatedPosts?.length || 0),
      views_per_hour: Number(average(cluster.relatedPosts?.map((post) => post.shareVelocity) || [])),
      score: Number(cluster.launchWorthinessScore || 0),
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
    return (data || []).map((row) => ({
      cluster_id: String(row.trend_id || "").replace(/^cluster:/, ""),
      canonical_entity: row.trend_name,
      total_attention: row.total_views,
      total_momentum: row.score_breakdown?.narrativeCluster?.totalMomentum || 0,
      propagation_persistence: row.score_breakdown?.narrativeCluster?.propagationPersistence || 0,
      snapshot: row.score_breakdown?.narrativeCluster || null,
      scanned_at: row.scanned_at,
    })).filter((row) => row.snapshot);
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
      score: score.total,
      token_found: !!canonicalToken,
      token_name: canonicalToken?.tokenName || null,
      token_address: canonicalToken?.tokenAddress || null,
      token_chain: canonicalToken?.chain || null,
      token_price_at_alert: canonicalToken?.priceUsd || null,
      token_mcap_at_alert: canonicalToken?.marketCap || null,
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
