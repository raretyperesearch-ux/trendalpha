import { config } from "../config.js";

const X_RECENT_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

const DEFAULT_SEARCH_QUERIES = [
  "has:media lang:en -is:retweet -is:reply",
  "(this is insane OR i can't believe OR bro really OR no way OR what is happening) lang:en -is:retweet",
  "(dog OR cat OR animal OR robot OR ai OR food OR game OR streamer) has:media lang:en -is:retweet",
  "(caught on camera OR went viral OR funniest OR wildest) lang:en -is:retweet",
];

export const CRYPTO_SATURATED_TERMS = [
  "pumpfun",
  "pump.fun",
  "memecoin",
  "meme coin",
  "ca",
  "contract address",
  "ticker",
  "100x",
  "solana",
  "degen",
  "cto",
  "dev sold",
  "moonshot",
  "launch token",
];

const FULL_TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "non_public_metrics",
  "organic_metrics",
  "attachments",
  "entities",
  "lang",
  "possibly_sensitive",
];

const SAFE_TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "attachments",
  "entities",
  "lang",
  "possibly_sensitive",
];

export async function fetchXAttention() {
  if (!config.x.bearerToken) {
    console.log("   ⚠️  X provider enabled but X_BEARER_TOKEN is missing");
    return [];
  }

  const queries = config.x.searchQueries.length > 0
    ? config.x.searchQueries
    : DEFAULT_SEARCH_QUERIES;

  const seen = new Set();
  const posts = [];

  for (const query of queries) {
    const response = await searchRecent(query);
    const usersById = indexById(response.includes?.users || []);
    const mediaByKey = indexByKey(response.includes?.media || []);

    for (const tweet of response.data || []) {
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);

      const normalized = normalizeTweet(tweet, usersById, mediaByKey);
      if (passesFilters(normalized, tweet)) posts.push(normalized);
    }
  }

  return posts.sort((a, b) => {
    const aScore = (a.viewsPerHour || 0) + (a.engagementPerHour || 0) * 20;
    const bScore = (b.viewsPerHour || 0) + (b.engagementPerHour || 0) * 20;
    return bScore - aScore;
  });
}

async function searchRecent(query) {
  try {
    return await requestRecentSearch(query, FULL_TWEET_FIELDS);
  } catch (err) {
    if (!err.retryWithoutPrivateMetrics) throw err;
    console.log("   ⚠️  X metrics access limited; retrying with public fields only");
    return requestRecentSearch(query, SAFE_TWEET_FIELDS);
  }
}

async function requestRecentSearch(query, tweetFields) {
  const params = new URLSearchParams({
    query,
    max_results: String(clamp(config.x.resultsPerQuery, 10, 100)),
    "tweet.fields": tweetFields.join(","),
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username,name,verified,public_metrics",
    "media.fields": "type,url,preview_image_url,public_metrics",
  });

  const res = await fetch(`${X_RECENT_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.x.bearerToken}`,
    },
  });

  const body = await readJson(res);
  if (!res.ok) {
    const message = body?.detail || body?.title || body?.errors?.[0]?.message || `X API returned ${res.status}`;
    const err = new Error(message);
    err.retryWithoutPrivateMetrics = [400, 403].includes(res.status) && tweetFields.includes("non_public_metrics");
    throw err;
  }

  return body;
}

function normalizeTweet(tweet, usersById, mediaByKey) {
  const publicMetrics = tweet.public_metrics || {};
  const privateMetrics = tweet.non_public_metrics || {};
  const organicMetrics = tweet.organic_metrics || {};
  const author = usersById.get(tweet.author_id);
  const media = (tweet.attachments?.media_keys || [])
    .map((key) => mediaByKey.get(key))
    .filter(Boolean);

  const engagementCount =
    Number(publicMetrics.like_count || 0) +
    Number(publicMetrics.retweet_count || 0) +
    Number(publicMetrics.reply_count || 0) +
    Number(publicMetrics.quote_count || 0);
  const impressionCount =
    Number(publicMetrics.impression_count || 0) ||
    Number(privateMetrics.impression_count || 0) ||
    Number(organicMetrics.impression_count || 0);
  const totalViews = impressionCount || engagementCount * 20;
  const hoursActive = getHoursSince(tweet.created_at);
  const viewsPerHour = Math.round(totalViews / hoursActive);
  const engagementPerHour = Math.round(engagementCount / hoursActive);
  const text = tweet.text || "";
  const riskFlags = containsCryptoSaturatedLanguage(text)
    ? ["crypto_saturated_language"]
    : [];

  return {
    id: `x-${tweet.id}`,
    sourcePlatform: "x",
    sourceUrl: `https://x.com/${author?.username || "i"}/status/${tweet.id}`,
    name: buildTitle(text, media.length > 0),
    text,
    author: author?.username || "unknown",
    authorName: author?.name || author?.username || "Unknown",
    type: "post",
    hasMedia: media.length > 0,
    mediaType: media[0]?.type || null,
    totalViews,
    videoCount: 0,
    likeCount: Number(publicMetrics.like_count || 0),
    repostCount: Number(publicMetrics.retweet_count || 0),
    replyCount: Number(publicMetrics.reply_count || 0),
    quoteCount: Number(publicMetrics.quote_count || 0),
    engagementCount,
    viewsPerHour,
    engagementPerHour,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: viewsPerHour >= config.x.minViews / 4 || engagementPerHour >= config.x.minLikes / 4 ? 1.2 : 1,
    trendDirection: viewsPerHour >= config.x.minViews / 4 || engagementPerHour >= config.x.minLikes / 4 ? "rising" : "stable",
    discoveredAt: new Date().toISOString(),
    earliestVideo: Math.floor(new Date(tweet.created_at).getTime() / 1000),
    riskFlags,
    cryptoSaturatedLanguage: riskFlags.includes("crypto_saturated_language"),
  };
}

function passesFilters(post, tweet) {
  if (tweet.lang && tweet.lang !== "en") return false;
  if (tweet.possibly_sensitive) return false;
  if (isRetweetOrReply(tweet.text)) return false;

  const ageHours = getHoursSince(tweet.created_at);
  if (ageHours > config.x.maxPostAgeHours) return false;

  return (
    post.totalViews >= config.x.minViews ||
    post.likeCount >= config.x.minLikes ||
    post.engagementPerHour >= Math.max(250, Math.round(config.x.minLikes / 3))
  );
}

function buildTitle(text, hasMedia) {
  const cleaned = cleanTweetText(text);
  if (!cleaned && hasMedia) return "Viral X Media Post";
  if (!cleaned) return "Viral X Post";
  if (cleaned.length <= 60) return cleaned;
  return `${cleaned.slice(0, 57).trim()}...`;
}

function cleanTweetText(text = "") {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/@\w+/g, "")
    .replace(/#(\w+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function containsCryptoSaturatedLanguage(text = "") {
  const lower = text.toLowerCase();
  return CRYPTO_SATURATED_TERMS.some((term) => {
    if (term === "ca") return /\bca\b|contract address/i.test(text);
    return lower.includes(term);
  });
}

function isRetweetOrReply(text = "") {
  return /^RT\s@/i.test(text) || /^@\w+/.test(text.trim());
}

function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function indexByKey(items) {
  return new Map(items.map((item) => [item.media_key, item]));
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function getHoursSince(dateString) {
  const created = new Date(dateString);
  const hours = (Date.now() - created.getTime()) / 3600000;
  return Math.max(1, hours);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
