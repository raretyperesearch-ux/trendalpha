import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { scoreLaunchOpportunity } from "../launchScoring.js";
import { generateLaunchBrief } from "../launchBrief.js";
import { getBuybackSummary } from "../buybacks.js";

const MAX_ROWS = 10;
const MIN_LAUNCH_SCORE = parseInt(process.env.MIN_LAUNCH_SCORE || "82", 10);

async function main() {
  const rows = await loadDashboardRows();
  renderDashboard(rows);
}

async function loadDashboardRows() {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("Supabase env vars not configured");

    const supabase = createClient(url, key);
    const { data: snapshots, error } = await supabase
      .from("trend_snapshots")
      .select("*")
      .order("scanned_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;
    if (!snapshots?.length) return buildMockRows("No Supabase snapshots found yet.");

    const trendIds = [...new Set(snapshots.map((row) => row.trend_id))];
    const { data: alerts } = await supabase
      .from("alerts_sent")
      .select("*")
      .in("trend_id", trendIds)
      .order("sent_at", { ascending: false })
      .limit(100);

    const latestAlertsByTrend = new Map();
    for (const alert of alerts || []) {
      if (!latestAlertsByTrend.has(alert.trend_id)) {
        latestAlertsByTrend.set(alert.trend_id, alert);
      }
    }

    return snapshots.map((snapshot) => {
      const alert = latestAlertsByTrend.get(snapshot.trend_id);
      const trend = trendFromSnapshot(snapshot);
      const token = tokenFromAlert(alert);
      const trendScore = scoreFromSnapshot(snapshot);
      const launchScore = scoreLaunchOpportunity(trend, token, null);
      const launchBrief = generateLaunchBrief({ trend, trendScore, launchScore, token });

      return {
        trend,
        trendScore,
        launchScore,
        suggestedTicker: launchBrief.suggestedTicker,
        token,
        scannedAt: snapshot.scanned_at,
        status: launchScore.total >= MIN_LAUNCH_SCORE ? "Launch Candidate" : "Watchlist",
      };
    });
  } catch (err) {
    return buildMockRows(`Supabase unavailable: ${err.message}`);
  }
}

function renderDashboard(rows) {
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: true,
  });

  console.clear();
  console.log("OINK ATTENTION DASHBOARD");
  console.log("=".repeat(80));
  console.log(`Updated: ${now} ET`);
  console.log(`Launch candidate threshold: ${MIN_LAUNCH_SCORE}/100`);
  console.log("");

  const note = rows.find((row) => row.note)?.note;
  if (note) {
    console.log(`Data note: ${note}`);
    console.log("");
  }

  console.log(
    formatColumns([
      ["Trend", 24],
      ["Launch", 8],
      ["Ticker", 10],
      ["Token", 9],
      ["Status", 18],
    ])
  );
  console.log("-".repeat(80));

  for (const row of rows) {
    console.log(
      formatColumns([
        [row.trend.name, 24],
        [`${row.launchScore.total}`, 8],
        [`$${row.suggestedTicker}`, 10],
        [row.token ? "exists" : "none", 9],
        [row.status, 18],
      ])
    );
  }

  console.log("");
  console.log("Latest Candidate Detail");
  console.log("-".repeat(80));
  const top = [...rows].sort((a, b) => b.launchScore.total - a.launchScore.total)[0];
  if (top) {
    console.log(`Trend: ${top.trend.name}`);
    console.log(`Launch score: ${top.launchScore.total}/100 (${top.launchScore.label})`);
    console.log(`Suggested ticker: $${top.suggestedTicker}`);
    console.log(`Token exists: ${top.token ? `${top.token.tokenName} on ${top.token.chain}` : "No"}`);
    console.log(`Status: ${top.status}`);
    console.log("Reasons:");
    for (const reason of top.launchScore.reasons.slice(0, 3)) {
      console.log(`- ${reason}`);
    }
  }

  console.log("");
  console.log("Buyback Flywheel");
  console.log("-".repeat(80));
  console.log("Viral Attention -> Autonomous Launch Review -> Fees -> $OINK Buybacks");
  console.log(getBuybackSummary());
  console.log("");
  console.log("Safety: dashboard is read-only. No launches, wallets, private keys, or transactions.");
}

function trendFromSnapshot(snapshot) {
  return {
    id: snapshot.trend_id,
    name: snapshot.trend_name,
    type: snapshot.trend_type || "hashtag",
    totalViews: Number(snapshot.total_views || 0),
    videoCount: Number(snapshot.video_count || 0),
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: 1,
    trendDirection: "stable",
    discoveredAt: snapshot.scanned_at,
    earliestVideo: Math.floor((new Date(snapshot.scanned_at).getTime() - 24 * 3600000) / 1000),
  };
}

function scoreFromSnapshot(snapshot) {
  return {
    total: Number(snapshot.score || 0),
    breakdown: snapshot.score_breakdown || {},
    metrics: {
      viewsPerHour: Number(snapshot.views_per_hour || 0),
      videoCount: Number(snapshot.video_count || 0),
      hoursActive: 24,
    },
  };
}

function tokenFromAlert(alert) {
  if (!alert?.token_found) return null;
  return {
    tokenName: alert.token_name || "Unknown",
    tokenAddress: alert.token_address || "",
    chain: alert.token_chain || "unknown",
    priceUsd: alert.token_price_at_alert || "0",
    marketCap: Number(alert.token_mcap_at_alert || 0),
    volume24h: 0,
    liquidity: 0,
    priceChange24h: 0,
    url: "",
  };
}

function buildMockRows(note) {
  const mockTrends = [
    {
      id: "mock-1",
      name: "#OfficePiggyBank",
      type: "hashtag",
      totalViews: 82_000_000,
      videoCount: 18_500,
      rank: 7,
      rankChange: 31,
      rankChangeType: 3,
      acceleration: 1.8,
      trendDirection: "rising",
      discoveredAt: new Date().toISOString(),
      earliestVideo: Math.floor((Date.now() - 18 * 3600000) / 1000),
    },
    {
      id: "mock-2",
      name: "#DeskSnack",
      type: "hashtag",
      totalViews: 14_500_000,
      videoCount: 4_200,
      rank: 33,
      rankChange: 12,
      rankChangeType: 1,
      acceleration: 1.25,
      trendDirection: "rising",
      discoveredAt: new Date().toISOString(),
      earliestVideo: Math.floor((Date.now() - 52 * 3600000) / 1000),
    },
  ];

  return mockTrends.map((trend, index) => {
    const token = index === 1
      ? {
          tokenName: "DESK",
          chain: "SOL",
          marketCap: 420_000,
          volume24h: 24_000,
          liquidity: 18_000,
        }
      : null;
    const launchScore = scoreLaunchOpportunity(trend, token, null);
    const trendScore = {
      total: Math.min(100, launchScore.total + 3),
      breakdown: {},
      metrics: { viewsPerHour: 0, videoCount: trend.videoCount, hoursActive: 24 },
    };
    const launchBrief = generateLaunchBrief({ trend, trendScore, launchScore, token });

    return {
      trend,
      trendScore,
      launchScore,
      suggestedTicker: launchBrief.suggestedTicker,
      token,
      scannedAt: trend.discoveredAt,
      status: launchScore.total >= MIN_LAUNCH_SCORE ? "Launch Candidate" : "Watchlist",
      note: index === 0 ? note : null,
    };
  });
}

function formatColumns(columns) {
  return columns
    .map(([value, width]) => truncate(String(value), width).padEnd(width))
    .join("  ");
}

function truncate(value, width) {
  if (value.length <= width) return value;
  return `${value.slice(0, width - 3)}...`;
}

main().catch((err) => {
  console.error("Dashboard failed:", err);
  process.exit(1);
});
