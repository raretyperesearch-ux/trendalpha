// ============================================================
// TIKTOK TREND SCANNER — Creative Center API (RapidAPI)
// ============================================================
// Pulls REAL trending data from TikTok's Creative Center
// No keyword guessing — detects what's actually going viral
//
// Endpoints: /api/trending/hashtag + /api/trending/song
// Data: hashtag/song name, video views, publish count, 7-day trend
// ============================================================

import https from "node:https";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tiktok-creative-center-api.p.rapidapi.com";

/**
 * Fetch with full buffering for large API responses
 */
function apiFetch(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: RAPIDAPI_HOST,
      path: path,
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const json = JSON.parse(body);
          resolve(json);
        } catch (err) {
          reject(new Error(`JSON parse failed: ${err.message}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

/**
 * Fetch trending hashtags from TikTok Creative Center
 * This is the REAL trending data — what's actually going viral
 */
async function fetchTrendingHashtags(page = 1, limit = 50) {
  try {
    const path = `/api/trending/hashtag?period=7&limit=${limit}&page=${page}&country_code=US`;
    console.log(`    📊 Fetching trending hashtags (page ${page})...`);
    const data = await apiFetch(path);

    if (data.code !== 0 || !data.data?.list) {
      console.error(`    ❌ API error:`, data.msg || "Unknown error");
      return [];
    }

    return data.data.list;
  } catch (err) {
    console.error(`    ❌ Trending hashtag fetch failed:`, err.message);
    return [];
  }
}

/**
 * Transform Creative Center data into our trend format
 */
function transformHashtag(item) {
  const trendCurve = item.trend || [];

  // Calculate acceleration from trend curve
  // Compare last 2 days vs first 2 days
  let acceleration = 1;
  if (trendCurve.length >= 4) {
    const recent = trendCurve.slice(-2).reduce((s, t) => s + t.value, 0) / 2;
    const earlier = trendCurve.slice(0, 2).reduce((s, t) => s + t.value, 0) / 2;
    acceleration = earlier > 0 ? recent / earlier : 1;
  }

  // Determine trend direction from curve
  let trendDirection = "stable";
  if (trendCurve.length >= 2) {
    const last = trendCurve[trendCurve.length - 1]?.value || 0;
    const prev = trendCurve[trendCurve.length - 2]?.value || 0;
    if (last > prev * 1.1) trendDirection = "rising";
    else if (last < prev * 0.9) trendDirection = "falling";
  }

  // Peak value in trend (1.0 = peak)
  const peakValue = Math.max(...trendCurve.map((t) => t.value || 0), 0);
  const currentValue = trendCurve[trendCurve.length - 1]?.value || 0;

  return {
    id: `hashtag-${item.hashtag_id}`,
    name: `#${item.hashtag_name}`,
    type: "hashtag",
    totalViews: item.video_views || 0,
    videoCount: item.publish_cnt || 0,
    rank: item.rank || 999,
    rankChange: item.rank_diff || 0,
    rankChangeType: item.rank_diff_type, // 1=up, 2=down, 3=new, 4=same
    acceleration,
    trendDirection,
    trendCurve,
    peakValue,
    currentValue,
    industry: item.industry_info?.value || null,
    discoveredAt: new Date().toISOString(),
    // Use trend timestamps for age calculation
    earliestVideo: trendCurve[0]?.time || 0,
  };
}

// ----------------------------------------------------------
// TRENDING SONGS/SOUNDS
// ----------------------------------------------------------

/**
 * Fetch trending songs from TikTok Creative Center
 */
async function fetchTrendingSongs(page = 1, limit = 20) {
  try {
    // Try /song endpoint first, fallback to /music
    const paths = [
      `/api/trending/song?period=7&limit=${limit}&page=${page}&rank_type=popular&country=US`,
    ];
    
    console.log(`    🎵 Fetching trending songs (page ${page})...`);
    
    for (const path of paths) {
      try {
        const data = await apiFetch(path);
        if (data.code === 0 && data.data?.sound_list?.length > 0) {
          return data.data.sound_list;
        }
        if (data.code === 0 && data.data?.list?.length > 0) {
          return data.data.list;
        }
      } catch (e) {
        // try next path
      }
    }

    console.error(`    ❌ Songs API: no data from any endpoint`);
    return [];
  } catch (err) {
    console.error(`    ❌ Trending songs fetch failed:`, err.message);
    return [];
  }
}

/**
 * Transform a trending song into our trend format
 * Songs don't have video_views/publish_cnt — we use rank + trend curve
 */
function transformSong(item) {
  const trendCurve = item.trend || [];

  let acceleration = 1;
  if (trendCurve.length >= 4) {
    const recent = trendCurve.slice(-2).reduce((s, t) => s + t.value, 0) / 2;
    const earlier = trendCurve.slice(0, 2).reduce((s, t) => s + t.value, 0) / 2;
    acceleration = earlier > 0 ? recent / earlier : 1;
  }

  let trendDirection = "stable";
  if (trendCurve.length >= 2) {
    const last = trendCurve[trendCurve.length - 1]?.value || 0;
    const prev = trendCurve[trendCurve.length - 2]?.value || 0;
    if (last > prev * 1.1) trendDirection = "rising";
    else if (last < prev * 0.9) trendDirection = "falling";
  }

  const songTitle = item.title || item.song_title || "Unknown Sound";
  const artist = item.author || "";
  const songId = item.clip_id || item.song_id || Math.random().toString(36).slice(2);
  const songLink = item.link || "";

  return {
    id: `song-${songId}`,
    name: songTitle,
    artist: artist,
    type: "song",
    totalViews: 0, // Songs don't provide view counts
    videoCount: 0, // Songs don't provide video counts
    rank: item.rank || 999,
    rankChange: item.rank_diff || 0,
    rankChangeType: item.rank_diff_type,
    acceleration,
    trendDirection,
    trendCurve,
    peakValue: Math.max(...trendCurve.map((t) => t.value || 0), 0),
    currentValue: trendCurve[trendCurve.length - 1]?.value || 0,
    songLink: songLink,
    duration: item.duration || 0,
    discoveredAt: new Date().toISOString(),
    earliestVideo: trendCurve[0]?.time || 0,
  };
}

// ----------------------------------------------------------
// MAIN EXPORT: fetchTrends()
// ----------------------------------------------------------

export async function fetchTrends() {
  console.log("📱 Scanning TikTok for trends...");

  try {
    // Fetch all 5 pages for the full top 100
    const [h1, h2, h3, h4, h5] = await Promise.all([
      fetchTrendingHashtags(1, 20),
      fetchTrendingHashtags(2, 20),
      fetchTrendingHashtags(3, 20),
      fetchTrendingHashtags(4, 20),
      fetchTrendingHashtags(5, 20),
    ]);
    const allHashtags = [...h1, ...h2, ...h3, ...h4, ...h5];
    console.log(`  📊 Got ${allHashtags.length} trending hashtags from TikTok`);

    // Transform into our format
    const trends = allHashtags.map(transformHashtag);

    // Sort by a combined signal:
    // Rising + high views + lots of creators = most interesting
    trends.sort((a, b) => {
      // Prioritize rising trends
      const aRising = a.trendDirection === "rising" ? 2 : a.trendDirection === "stable" ? 1 : 0;
      const bRising = b.trendDirection === "rising" ? 2 : b.trendDirection === "stable" ? 1 : 0;
      if (aRising !== bRising) return bRising - aRising;

      // Then by views
      return b.totalViews - a.totalViews;
    });

    console.log(`📱 Found ${trends.length} trending topics`);

    // Log top 10 for visibility
    for (const t of trends.slice(0, 10)) {
      const arrow = t.trendDirection === "rising" ? "📈" : t.trendDirection === "falling" ? "📉" : "➡️";
      console.log(
        `   ${arrow} ${t.name} — ${formatViews(t.totalViews)} views, ${formatViews(t.videoCount)} videos, rank #${t.rank}`
      );
    }

    return trends;
  } catch (err) {
    console.error("❌ Trend scan failed:", err.message);
    return [];
  }
}

/**
 * Calculate hours active from trend data
 * Uses the earliest data point in the trend curve
 */
export function getHoursActive(trend) {
  if (trend.hoursActive) return Math.max(1, trend.hoursActive);
  if (trend.earliestVideo && trend.earliestVideo > 0) {
    const created = new Date(trend.earliestVideo * 1000);
    const now = new Date();
    const hours = Math.round((now - created) / 3600000);
    return Math.max(1, hours);
  }
  // Default: trend data is 7 days
  return 168;
}

/**
 * Get views per hour
 */
export function getViewsPerHour(trend) {
  if (trend.viewsPerHour) return Math.round(trend.viewsPerHour);
  const hours = getHoursActive(trend);
  return Math.round((trend.totalViews || 0) / hours);
}

// ----------------------------------------------------------
// HELPERS
// ----------------------------------------------------------

function formatViews(num) {
  if (!num) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
