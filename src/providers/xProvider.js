import { config } from "../config.js";

const X_RECENT_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

const DEFAULT_SEARCH_QUERIES = [
  "(no way OR insane OR wild OR unbelievable OR hilarious) has:media lang:en -is:retweet -is:reply",
  "(dog OR cat OR animal OR robot OR ai OR food OR game OR streamer) has:media lang:en -is:retweet -is:reply",
  '("caught on camera" OR "went viral" OR funniest OR wildest OR "this is insane") lang:en -is:retweet -is:reply',
  '(bro OR "no way" OR "im crying" OR "this killed me" OR "what is happening") lang:en -is:retweet -is:reply',
  "(airport OR robot OR mascot OR restaurant OR school OR sports OR concert OR livestream) has:media lang:en -is:retweet -is:reply",
  "(video OR photo OR clip OR moment OR scene) has:media lang:en -is:retweet -is:reply",
  "(funny OR hilarious OR wild OR unreal OR bizarre) lang:en -is:retweet -is:reply",
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

const SAFE_TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "attachments",
  "entities",
  "lang",
  "possibly_sensitive",
];

const MINIMAL_TWEET_FIELDS = [
  "created_at",
  "public_metrics",
  "lang",
];

export async function fetchXAttention() {
  if (!config.x.bearerToken) {
    console.log("   ⚠️  X provider enabled but X_BEARER_TOKEN is missing");
    return [];
  }

  const queries = config.x.searchQueries.length > 0
    ? config.x.searchQueries
    : DEFAULT_SEARCH_QUERIES;
  const validQueries = queries
    .map(sanitizeXQuery)
    .filter(Boolean);

  if (validQueries.length === 0) {
    console.log("   ⚠️  No valid X search queries configured");
    return [];
  }

  const seen = new Set();
  const posts = [];

  for (const query of validQueries) {
    let response;
    try {
      response = await searchRecent(query);
    } catch (err) {
      console.error(`❌ X provider failed for query "${query}":`, err.message);
      continue;
    }

    const usersById = indexById(response.includes?.users || []);
    const mediaByKey = indexByKey(response.includes?.media || []);
    const rawTweets = response.data || [];
    let acceptedCount = 0;
    const rejected = [];

    for (const tweet of rawTweets) {
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);

      const normalized = normalizeTweet(tweet, usersById, mediaByKey);
      const rejectionReason = getFilterRejectionReason(normalized, tweet);
      if (!rejectionReason) {
        posts.push(normalized);
        acceptedCount += 1;
      } else {
        rejected.push({ post: normalized, reason: rejectionReason });
      }
    }

    console.log(`   🔎 X query accepted ${acceptedCount}/${rawTweets.length} posts: ${query}`);
    if (acceptedCount === 0 && rejected.length > 0) {
      const strongest = rejected.sort((a, b) => (b.post.attentionShapeScore || 0) - (a.post.attentionShapeScore || 0))[0];
      console.log(
        `      Top rejected: ${strongest.reason}; ` +
        `${strongest.post.viewsPerHour.toLocaleString()} v/hr, ` +
        `${strongest.post.shareVelocity.toLocaleString(undefined, { maximumFractionDigits: 1 })} shares/hr, ` +
        `${strongest.post.engagementPerHour.toLocaleString()} eng/hr, ` +
        `shape ${strongest.post.attentionShapeScore.toLocaleString()}`
      );
    }
  }

  return posts.sort((a, b) => (b.attentionShapeScore || 0) - (a.attentionShapeScore || 0));
}

export function sanitizeXQuery(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return null;

  if (!hasSearchTerm(trimmed)) {
    console.log(`   ⚠️  Skipping invalid X search query without a real search term: ${trimmed}`);
    return null;
  }

  return trimmed;
}

function hasSearchTerm(query) {
  const tokens = query
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.some((token) => {
    const normalized = token.toLowerCase().replace(/^[-+]+/, "").replace(/^"|"$/g, "");
    if (!normalized || normalized === "or" || normalized === "and") return false;
    if (normalized.includes(":")) return false;
    return /[a-z0-9]/i.test(normalized);
  });
}

async function searchRecent(query) {
  const attempts = [
    {
      label: "full public fields with media",
      tweetFields: SAFE_TWEET_FIELDS,
      expansions: "author_id,attachments.media_keys",
      userFields: "username,name,public_metrics",
      mediaFields: "type,url,preview_image_url",
    },
    {
      label: "public fields without media",
      tweetFields: SAFE_TWEET_FIELDS,
      expansions: "author_id",
      userFields: "username,name,public_metrics",
      mediaFields: null,
    },
    {
      label: "minimal tweet fields",
      tweetFields: MINIMAL_TWEET_FIELDS,
      expansions: null,
      userFields: null,
      mediaFields: null,
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await requestRecentSearch(query, attempt);
    } catch (err) {
      lastError = err;
      console.log(`   ⚠️  X request failed (${attempt.label}); trying fallback if available`);
    }
  }

  throw lastError || new Error("X recent search failed");
}

async function requestRecentSearch(query, attempt) {
  const params = new URLSearchParams({
    query,
    max_results: String(clamp(config.x.resultsPerQuery, 10, 100)),
    "tweet.fields": attempt.tweetFields.join(","),
  });
  if (attempt.expansions) params.set("expansions", attempt.expansions);
  if (attempt.userFields) params.set("user.fields", attempt.userFields);
  if (attempt.mediaFields) params.set("media.fields", attempt.mediaFields);

  const res = await fetch(`${X_RECENT_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.x.bearerToken}`,
    },
  });

  const body = await readJson(res);
  if (!res.ok) {
    const message = body?.detail || body?.title || body?.errors?.[0]?.message || `X API returned ${res.status}`;
    const err = new Error(message);
    console.error("   X API error body:", safeStringify(body));
    throw err;
  }

  return body;
}

function normalizeTweet(tweet, usersById, mediaByKey) {
  const publicMetrics = tweet.public_metrics || {};
  const author = usersById.get(tweet.author_id);
  const media = (tweet.attachments?.media_keys || [])
    .map((key) => mediaByKey.get(key))
    .filter(Boolean);

  const engagementCount =
    Number(publicMetrics.like_count || 0) +
    Number(publicMetrics.retweet_count || 0) +
    Number(publicMetrics.reply_count || 0) +
    Number(publicMetrics.quote_count || 0);
  const impressionCount = Number(publicMetrics.impression_count || 0);
  const totalViews = impressionCount || engagementCount * 20;
  const hoursActive = getHoursSince(tweet.created_at);
  const viewsPerHour = Math.round(totalViews / hoursActive);
  const engagementPerHour = Math.round(engagementCount / hoursActive);
  const text = tweet.text || "";
  const riskFlags = containsCryptoSaturatedLanguage(text)
    ? ["crypto_saturated_language"]
    : [];
  const likeCount = Number(publicMetrics.like_count || 0);
  const repostCount = Number(publicMetrics.retweet_count || 0);
  const replyCount = Number(publicMetrics.reply_count || 0);
  const quoteCount = Number(publicMetrics.quote_count || 0);
  const shareCount = repostCount + quoteCount;
  const shareVelocity = shareCount / hoursActive;
  const repostVelocity = repostCount / hoursActive;
  const quoteVelocity = quoteCount / hoursActive;
  const shareRate = shareCount / Math.max(1, totalViews);
  const quoteRate = quoteCount / Math.max(1, shareCount);
  const likeRate = likeCount / Math.max(1, totalViews);
  const replyRate = replyCount / Math.max(1, totalViews);
  const cryptoSaturatedLanguage = riskFlags.includes("crypto_saturated_language");
  const attentionShapeScore = getAttentionShapeScore({
    viewsPerHour,
    shareVelocity,
    quoteVelocity,
    repostVelocity,
    engagementPerHour,
    hasMedia: media.length > 0,
    cryptoSaturatedLanguage,
  });

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
    likeCount,
    repostCount,
    replyCount,
    quoteCount,
    shareCount,
    shareVelocity,
    repostVelocity,
    quoteVelocity,
    shareRate,
    quoteRate,
    likeRate,
    replyRate,
    engagementCount,
    viewsPerHour,
    engagementPerHour,
    attentionShapeScore,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: viewsPerHour >= config.x.minViews / 4 || engagementPerHour >= config.x.minLikes / 4 ? 1.2 : 1,
    trendDirection: viewsPerHour >= config.x.minViews / 4 || engagementPerHour >= config.x.minLikes / 4 ? "rising" : "stable",
    discoveredAt: new Date().toISOString(),
    earliestVideo: Math.floor(new Date(tweet.created_at).getTime() / 1000),
    riskFlags,
    cryptoSaturatedLanguage,
  };
}

function passesFilters(post, tweet) {
  return !getFilterRejectionReason(post, tweet);
}

function getFilterRejectionReason(post, tweet) {
  if (tweet.lang && tweet.lang !== "en") return "non_english";
  if (tweet.possibly_sensitive) return "possibly_sensitive";
  if (isRetweetOrReply(tweet.text)) return "retweet_or_reply";

  const ageHours = getHoursSince(tweet.created_at);
  if (ageHours > config.x.maxPostAgeHours) return `too_old_${Math.round(ageHours)}h`;

  const meetsAttentionThreshold =
    post.totalViews >= config.x.minViews ||
    post.likeCount >= config.x.minLikes ||
    post.shareCount >= config.x.minShares ||
    post.shareVelocity >= config.x.minShareVelocity ||
    post.viewsPerHour >= config.x.minViewsPerHour ||
    post.engagementPerHour >= config.x.minEngagementPerHour ||
    post.attentionShapeScore >= config.x.minAttentionShapeScore;

  return meetsAttentionThreshold ? null : "below_attention_thresholds";
}

function getAttentionShapeScore({
  viewsPerHour,
  shareVelocity,
  quoteVelocity,
  repostVelocity,
  engagementPerHour,
  hasMedia,
  cryptoSaturatedLanguage,
}) {
  let score =
    viewsPerHour +
    shareVelocity * 250 +
    quoteVelocity * 400 +
    repostVelocity * 200 +
    engagementPerHour * 25;

  if (hasMedia) score *= 1.15;
  if (cryptoSaturatedLanguage) score *= 0.7;

  return Math.round(score);
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

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
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
