import { getHoursActive, getViewsPerHour } from "./tiktok.js";

const GENERIC_TERMS = new Set([
  "fyp",
  "viral",
  "trending",
  "trend",
  "funny",
  "love",
  "news",
  "music",
  "song",
  "dance",
  "challenge",
  "motivation",
  "relatable",
]);

const IP_TERMS = [
  "disney",
  "marvel",
  "pokemon",
  "nintendo",
  "apple",
  "tesla",
  "nike",
  "taylor swift",
  "swiftie",
  "beyonce",
  "drake",
  "celebrity",
  "trump",
  "biden",
  "kim kardashian",
];

const SENSITIVE_TERMS = [
  "death",
  "dead",
  "murder",
  "shooting",
  "war",
  "terror",
  "tragedy",
  "suicide",
  "abuse",
  "disease",
  "cancer",
  "earthquake",
  "flood",
];

const POLITICAL_TERMS = [
  "election",
  "senate",
  "congress",
  "democrat",
  "republican",
  "maga",
  "liberal",
  "conservative",
  "president",
  "governor",
  "minister",
];

export function scoreLaunchOpportunity(trend, token = null, previousSnapshot = null) {
  const name = normalizeName(trend.name);
  const words = name.split(/\s+/).filter(Boolean);
  const viewsPerHour = getViewsPerHour(trend);
  const hoursActive = getHoursActive(trend);
  const isNewEntry = trend.rankChangeType === 3;
  const riskFlags = getRiskFlags(name, words, trend);

  const attentionVelocity = scoreAttentionVelocity({ trend, viewsPerHour, previousSnapshot, riskFlags });
  const freshness = scoreFreshness({ trend, hoursActive, isNewEntry });
  const memeClarity = scoreMemeClarity({ name, words, trend, riskFlags });
  const tickerStrength = scoreTickerStrength(name, words);
  const visualStrength = scoreVisualStrength({ name, words, trend, riskFlags });
  const saturation = scoreSaturation(token, trend);
  const risk = scoreRisk(riskFlags);

  const breakdown = {
    attentionVelocity,
    freshness,
    memeClarity,
    tickerStrength,
    visualStrength,
    saturation,
    risk,
  };

  const total = Math.max(
    0,
    Math.min(100, getLaunchTotal({ trend, breakdown }))
  );

  return {
    total,
    label: getLabel(total),
    breakdown,
    launchWorthinessScore: trend.launchWorthinessScore || null,
    launchRecommendation: trend.launchRecommendation || null,
    reasons: getReasons({ trend, token, viewsPerHour, isNewEntry, breakdown, riskFlags }),
    riskFlags,
  };
}

function getLaunchTotal({ trend, breakdown }) {
  const base = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  if (trend.sourcePlatform !== "x" || !Number.isFinite(trend.launchWorthinessScore)) return base;
  const blended = base * 0.68 + trend.launchWorthinessScore * 0.32;
  if (trend.launchRecommendation === "DO_NOT_LAUNCH") return Math.min(blended, 54);
  if (trend.launchRecommendation === "WATCH") return Math.min(blended, 64);
  if (trend.launchRecommendation === "BREAKOUT_FORMING") return Math.max(blended, 82);
  return blended;
}

function scoreAttentionVelocity({ trend, viewsPerHour, previousSnapshot, riskFlags = [] }) {
  if (trend.sourcePlatform === "x") {
    return scoreXAttentionVelocity({ trend, viewsPerHour, riskFlags });
  }

  let score = 0;
  if (viewsPerHour >= 2_000_000) score = 20;
  else if (viewsPerHour >= 1_000_000) score = 17;
  else if (viewsPerHour >= 500_000) score = 14;
  else if (viewsPerHour >= 200_000) score = 10;
  else if (viewsPerHour >= 100_000) score = 7;
  else score = Math.round((viewsPerHour / 100_000) * 7);
  if (trend.trendDirection === "rising") score += 3;
  if ((trend.acceleration || 1) >= 1.5) score += 2;
  else if ((trend.acceleration || 1) >= 1.2) score += 1;

  if (previousSnapshot?.viewsPerHour > 0) {
    const growth = viewsPerHour / previousSnapshot.viewsPerHour;
    if (growth >= 2) score += 2;
    else if (growth >= 1.4) score += 1;
  }

  if (trend.trendDirection === "falling") score -= 5;
  return clamp(score, 0, 25);
}

function scoreFreshness({ trend, hoursActive, isNewEntry }) {
  let score = 6;
  if (hoursActive <= 24) score = 16;
  else if (hoursActive <= 48) score = 14;
  else if (hoursActive <= 96) score = 11;
  else if (hoursActive <= 168) score = 8;

  if (isNewEntry) score += 4;
  else if (trend.rankChangeType === 1 && trend.rankChange >= 10) score += 2;
  if (trend.rank && trend.rank <= 20) score += 1;

  return clamp(score, 0, 20);
}

function scoreMemeClarity({ name, words, trend, riskFlags = [] }) {
  if (trend.sourcePlatform === "x") {
    return scoreXMemeClarity({ name, words, trend, riskFlags });
  }

  let score = 8;
  const joined = words.join("");

  if (words.length <= 2 && joined.length >= 4 && joined.length <= 16) score += 4;
  else if (words.length <= 4 && joined.length <= 24) score += 2;

  if (trend.type === "hashtag") score += 2;
  if (hasDistinctiveWord(words)) score += 1;
  if (words.some((word) => GENERIC_TERMS.has(word))) score -= 4;
  if (name.length > 28) score -= 3;

  return clamp(score, 0, 15);
}

function scoreTickerStrength(name, words) {
  const ticker = buildTicker(name, words);
  let score = 4;

  if (ticker.length >= 3 && ticker.length <= 6) score += 6;
  else if (ticker.length >= 7 && ticker.length <= 10) score += 4;
  else if (ticker.length > 10) score += 1;

  if (/^[A-Z0-9]+$/.test(ticker)) score += 2;
  if (words.length <= 2) score += 2;
  if (GENERIC_TERMS.has(words[0])) score -= 3;

  return clamp(score, 0, 15);
}

function scoreVisualStrength({ name, words, trend, riskFlags = [] }) {
  if (trend.sourcePlatform === "x") {
    return scoreXVisualStrength({ name, words, trend, riskFlags });
  }

  let score = 5;
  if (trend.type === "hashtag") score += 1;
  if (trend.hasMedia) score += 2;
  if (words.some((word) => /pig|oink|frog|dog|cat|baby|pepe|wojak|chad|shark|goat|moo|bear|bull/i.test(word))) score += 3;
  if (words.some((word) => /girl|boy|mom|dad|boss|queen|king|chef|doctor|teacher|mascot/i.test(word))) score += 2;
  if (name.length <= 18) score += 1;
  return clamp(score, 0, 10);
}

function scoreSaturation(token, trend = null) {
  if (token?.matchStatus === "possible") return 8;
  if (!token && trend?.cryptoSaturatedLanguage) return 6;
  if (!token) return 10;

  const volume = Number(token.volume24h || 0);
  const liquidity = Number(token.liquidity || 0);
  const marketCap = Number(token.marketCap || 0);

  if (volume >= 1_000_000 || liquidity >= 500_000 || marketCap >= 10_000_000) return 1;
  if (volume >= 250_000 || liquidity >= 100_000 || marketCap >= 2_500_000) return 3;
  if (volume >= 50_000 || liquidity >= 25_000) return 5;
  return 7;
}

function scoreRisk(riskFlags) {
  if (riskFlags.some((flag) => ["sensitive or tragedy term", "political term", "celebrity/brand/IP term"].includes(flag))) return 0;
  if (riskFlags.includes("crypto_saturated_language")) return 1;
  if (riskFlags.length === 0) return 5;
  if (riskFlags.length === 1) return 3;
  if (riskFlags.length === 2) return 1;
  return 0;
}

function getReasons({ trend, token, viewsPerHour, isNewEntry, breakdown, riskFlags }) {
  if (trend.sourcePlatform === "x") {
    return getXReasons({ trend, token, viewsPerHour, breakdown, riskFlags });
  }

  const reasons = [];
  if (breakdown.attentionVelocity >= 18) reasons.push(`Strong attention velocity at ${formatCount(viewsPerHour)} views/hour.`);
  if (trend.trendDirection === "rising") reasons.push(`Trend direction is rising on ${trend.sourcePlatform === "x" ? "X" : "TikTok"}.`);
  if (isNewEntry) reasons.push("New entry into the TikTok top 100, which can signal early market formation.");
  if (trend.sourcePlatform === "x" && trend.engagementPerHour >= 500) reasons.push(`High X engagement velocity at ${formatCount(trend.engagementPerHour)} engagements/hour.`);
  if (breakdown.memeClarity >= 11) reasons.push("Name is short and memeable enough to package into a market.");
  if (breakdown.tickerStrength >= 11) reasons.push("Clean ticker candidate with low punctuation/friction.");
  if (!token) reasons.push("No strong matching token found, so market saturation appears low.");
  else if (breakdown.saturation <= 3) reasons.push("Existing token activity is already meaningful, reducing launch white space.");
  if (riskFlags.length > 0) reasons.push(`Risk review needed: ${riskFlags.join(", ")}.`);
  return reasons.slice(0, 5);
}

function getRiskFlags(name, words, trend = null) {
  const flags = [...(trend?.riskFlags || [])];
  const lower = name.toLowerCase();

  if (trend?.sourcePlatform === "x") {
    if ((trend.text || name).length > 160) flags.push("very long name");
  } else if (name.length > 32 || words.length > 5) {
    flags.push("very long name");
  }
  if (words.some((word) => GENERIC_TERMS.has(word))) flags.push("generic spam term");
  if (IP_TERMS.some((term) => lower.includes(term))) flags.push("celebrity/brand/IP term");
  if (SENSITIVE_TERMS.some((term) => lower.includes(term))) flags.push("sensitive or tragedy term");
  if (POLITICAL_TERMS.some((term) => lower.includes(term))) flags.push("political term");
  if (trend?.cryptoSaturatedLanguage) flags.push("crypto_saturated_language");

  return [...new Set(flags)];
}

function scoreXAttentionVelocity({ trend, viewsPerHour, riskFlags = [] }) {
  const engagementPerHour = trend.engagementPerHour || 0;
  const likeCount = trend.likeCount || 0;
  const repostCount = trend.repostCount || 0;
  const replyCount = trend.replyCount || 0;
  const quoteCount = trend.quoteCount || 0;
  const weightedEngagement =
    likeCount +
    repostCount * 2 +
    replyCount * 1.25 +
    quoteCount * 3;

  let score = 0;
  if (viewsPerHour >= 1_000_000) score += 9;
  else if (viewsPerHour >= 500_000) score += 7;
  else if (viewsPerHour >= 200_000) score += 5;
  else if (viewsPerHour >= 100_000) score += 3;

  if (engagementPerHour >= 5_000) score += 9;
  else if (engagementPerHour >= 2_500) score += 7;
  else if (engagementPerHour >= 1_000) score += 5;
  else if (engagementPerHour >= 500) score += 3;

  if (weightedEngagement >= 150_000) score += 5;
  else if (weightedEngagement >= 75_000) score += 4;
  else if (weightedEngagement >= 30_000) score += 3;
  else if (weightedEngagement >= 10_000) score += 2;

  if (quoteCount >= 2_000) score += 2;
  else if (quoteCount >= 500) score += 1;
  if (trend.trendDirection === "rising") score += 2;
  if (trend.cryptoSaturatedLanguage) score -= 3;
  if (isHeavyRiskTrend(riskFlags)) score -= 6;

  return clamp(score, 0, 25);
}

function scoreXMemeClarity({ name, words, trend, riskFlags = [] }) {
  const text = (trend.text || trend.name || "").trim();
  const compact = words.join("");
  let score = 6;

  if (text.length > 0 && text.length <= 80) score += 4;
  else if (text.length <= 140) score += 2;

  if (words.length >= 2 && words.length <= 6) score += 3;
  else if (words.length <= 10) score += 1;

  if (compact.length >= 4 && compact.length <= 24) score += 2;
  if ((trend.marketabilityScore || 0) >= 70) score += 2;
  else if ((trend.marketabilityScore || 0) >= 50) score += 1;
  if (trend.quoteExplosion || trend.propagationRatio >= 0.12) score += 1;
  if (trend.cryptoSaturatedLanguage) score -= 4;
  if (isHeavyRiskTrend(riskFlags)) score -= 7;
  if (name.length > 45) score -= 2;

  return clamp(score, 0, 15);
}

function scoreXVisualStrength({ name, words, trend, riskFlags = [] }) {
  let score = 3;
  if (trend.hasMedia) score += 4;
  if (trend.mediaType === "video" || trend.mediaType === "animated_gif") score += 2;
  if ((trend.marketabilityScore || 0) >= 60) score += 2;
  if ((trend.text || "").length <= 100) score += 1;
  if (isHeavyRiskTrend(riskFlags)) score -= 5;
  return clamp(score, 0, 10);
}

function getXReasons({ trend, token, viewsPerHour, breakdown, riskFlags }) {
  const reasons = [];

  if (riskFlags.length > 0) {
    reasons.push(`Risk review needed: ${riskFlags.join(", ")}.`);
  }

  if (trend.engagementPerHour >= 500 || breakdown.attentionVelocity >= 15) {
    reasons.push(`High X engagement velocity at ${formatCount(trend.engagementPerHour || 0)} engagements/hour.`);
  }

  if (trend.launchWorthinessScore >= 75) {
    reasons.push(`Launch-worthiness is ${trend.launchWorthinessScore}/100 with ${trend.launchRecommendation} recommendation.`);
  }

  if (trend.marketArchetype) {
    reasons.push(`Market archetype: ${trend.marketArchetype}; narrative half-life: ${trend.narrativeHalfLifeEstimate}.`);
  }

  if ((trend.quoteCount || 0) >= 250 || (trend.repostCount || 0) >= 1_000) {
    reasons.push("Strong quote/repost activity indicates remix potential.");
  }

  if (trend.hasMedia && breakdown.visualStrength >= 7) {
    reasons.push("Visual post with meme potential.");
  }

  if ((trend.text || "").trim().length > 0 && (trend.text || "").trim().length <= 100 && breakdown.memeClarity >= 10) {
    reasons.push("Short repeatable phrase.");
  }

  if (!trend.cryptoSaturatedLanguage) {
    reasons.push("No obvious crypto saturation.");
  }

  if (!token) {
    reasons.push("No strong matching token found, so market saturation appears low.");
  }

  if (reasons.length === 0) {
    reasons.push(`X post is moving at ${formatCount(viewsPerHour)} views/hour.`);
  }

  return reasons.slice(0, 5);
}

function isHeavyRiskTrend(riskFlags = []) {
  const flags = new Set(riskFlags);
  return (
    flags.has("political term") ||
    flags.has("sensitive or tragedy term") ||
    flags.has("celebrity/brand/IP term")
  );
}

function normalizeName(name = "") {
  return name
    .replace(/^#+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildTicker(name, words) {
  const compact = words.join("").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length <= 10) return compact;
  return words
    .slice(0, 2)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .join("")
    .slice(0, 10)
    .toUpperCase();
}

function hasDistinctiveWord(words) {
  return words.some((word) => word.length >= 4 && !GENERIC_TERMS.has(word));
}

function getLabel(total) {
  if (total >= 85) return "EXTREME";
  if (total >= 75) return "HIGH";
  if (total >= 65) return "MEDIUM";
  if (total >= 55) return "LOW";
  return "REJECT";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatCount(num) {
  if (!num) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
