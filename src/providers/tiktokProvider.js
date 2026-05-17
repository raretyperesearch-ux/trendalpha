import { fetchTrends } from "../tiktok.js";

export async function fetchTikTokAttention() {
  const trends = await fetchTrends();
  return trends.map(normalizeTikTokTrend);
}

function normalizeTikTokTrend(trend) {
  const cleanName = trend.name.replace(/^#/, "");
  return {
    ...trend,
    sourcePlatform: "tiktok",
    sourceUrl: trend.type === "hashtag"
      ? `https://www.tiktok.com/tag/${encodeURIComponent(cleanName)}`
      : trend.songLink || "https://www.tiktok.com/",
    coverImage: trend.coverImage || trend.thumbnailUrl || trend.coverUrl || trend.videoCover || "",
    thumbnailUrl: trend.thumbnailUrl || trend.coverImage || trend.coverUrl || trend.videoCover || "",
    videoUrl: trend.videoUrl || "",
    riskFlags: trend.riskFlags || [],
  };
}
