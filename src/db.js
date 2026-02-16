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
    const { error } = await supabase.from("trend_snapshots").insert({
      trend_id: trend.id,
      trend_name: trend.name,
      trend_type: trend.type,
      total_views: trend.totalViews,
      video_count: trend.videoCount,
      views_per_hour: score.metrics.viewsPerHour,
      score: score.total,
      score_breakdown: score.breakdown,
      scanned_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (err) {
    console.error("❌ Failed to save snapshot:", err.message);
  }
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
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// ALERTS — track what we've sent
// ----------------------------------------------------------

/**
 * Check if we've already alerted for this trend recently
 * (prevents spam — only alert once per trend per 6 hours)
 */
export async function wasAlertedRecently(trendId) {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 3600000).toISOString();

    const { data, error } = await supabase
      .from("alerts_sent")
      .select("id")
      .eq("trend_id", trendId)
      .gte("sent_at", sixHoursAgo)
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
    const { error } = await supabase.from("alerts_sent").insert({
      trend_id: trend.id,
      trend_name: trend.name,
      score: score.total,
      token_found: !!token,
      token_name: token?.tokenName || null,
      token_address: token?.tokenAddress || null,
      token_chain: token?.chain || null,
      token_price_at_alert: token?.priceUsd || null,
      token_mcap_at_alert: token?.marketCap || null,
      sent_at: new Date().toISOString(),
    });

    if (error) throw error;
  } catch (err) {
    console.error("❌ Failed to record alert:", err.message);
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
