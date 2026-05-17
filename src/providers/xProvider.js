import { config } from "../config.js";
import { applyLaunchWorthiness } from "../launchWorthiness.js";

const X_RECENT_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

const TRUSTED_VIRAL_ACCOUNTS = [
  "PopBase",
  "Dexerto",
  "DiscussingFilm",
  "CultureCrave",
  "InternetH0F",
  "PicturesFoIder",
  "DailyLoud",
  "DramaAlert",
  "Complex",
  "WorldStar",
  "NoContextHumans",
];

// X rejects pure operator streams like "has:media lang:en"; these broad
// neutral terms keep discovery attention-first while satisfying query syntax.
const DEFAULT_SEARCH_QUERIES = [
  { lane: "broad_media_stream", query: "(the OR this OR that OR what OR how) has:media lang:en -is:retweet -is:reply" },
  { lane: "broad_media_stream", query: "(video OR clip OR photo OR picture OR moment) has:media lang:en -is:retweet -is:reply" },
  { lane: "emerging_accounts", query: "(people OR someone OR guy OR girl OR kid) has:media lang:en -is:retweet -is:reply" },
  { lane: "quote_explosion_watch", query: "(today OR now OR here OR there OR when) has:media lang:en -is:retweet -is:reply" },
  { lane: "broad_media_stream", query: "(watch OR look OR see OR made OR found) has:media lang:en -is:retweet -is:reply" },
  { lane: "trusted_viral_accounts", query: buildTrustedAccountQuery(TRUSTED_VIRAL_ACCOUNTS.slice(0, 6)) },
  { lane: "trusted_viral_accounts", query: buildTrustedAccountQuery(TRUSTED_VIRAL_ACCOUNTS.slice(6)) },
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

  const querySources = config.x.searchQueries.length > 0
    ? config.x.searchQueries.map((query) => ({ lane: "custom", query }))
    : DEFAULT_SEARCH_QUERIES;
  const validQueries = querySources
    .map(({ lane, query }) => ({ lane, query: sanitizeXQuery(query) }))
    .filter((item) => item.query);

  if (validQueries.length === 0) {
    console.log("   ⚠️  No valid X search queries configured");
    return [];
  }

  const seen = new Set();
  const posts = [];

  for (const { lane, query } of validQueries) {
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
    const scouts = [];

    for (const tweet of rawTweets) {
      if (seen.has(tweet.id)) continue;
      seen.add(tweet.id);

      const normalized = normalizeTweet(tweet, usersById, mediaByKey, lane);
      const rejectionReason = getFilterRejectionReason(normalized, tweet);
      if (!rejectionReason) {
        posts.push(normalized);
        acceptedCount += 1;
        logAcceptedPost(normalized);
      } else {
        rejected.push({ post: normalized, reason: rejectionReason });
      }
    }

    if (acceptedCount === 0 && config.x.maxScoutPostsPerQuery > 0) {
      const eligibleScouts = rejected
        .filter(({ post, reason }) => reason === "below_attention_thresholds" && post.attentionShapeScore >= config.x.minScoutShapeScore)
        .sort((a, b) => (b.post.attentionShapeScore || 0) - (a.post.attentionShapeScore || 0))
        .slice(0, config.x.maxScoutPostsPerQuery);

      for (const { post } of eligibleScouts) {
        post.isScoutCandidate = true;
        post.riskFlags = [...new Set([...(post.riskFlags || []), "x_scout_candidate"])];
        posts.push(post);
        scouts.push(post);
        logAcceptedPost(post);
      }
    }

    console.log(`   🔎 X query accepted ${acceptedCount}/${rawTweets.length} posts: ${query}`);
    if (scouts.length > 0) {
      console.log(
        `      Scout fallback kept ${scouts.length} post(s); ` +
        `top shape ${scouts[0].attentionShapeScore.toLocaleString()}`
      );
    }
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

export function applyXSnapshotPersistence(post, previousSnapshot = null) {
  if (post?.sourcePlatform !== "x") return post;

  const previous = previousSnapshot?.x || {};
  const attentionMomentumDelta = delta(post.attentionMomentum, previous.attentionMomentum);
  const shareVelocityDelta = delta(post.shareVelocity, previous.shareVelocity);
  const quoteVelocityDelta = delta(post.quoteVelocity, previous.quoteVelocity);
  const accelerationSlope = delta(post.engagementAcceleration, previous.engagementAcceleration);

  post.attentionMomentumDelta = attentionMomentumDelta;
  post.shareVelocityDelta = shareVelocityDelta;
  post.quoteVelocityDelta = quoteVelocityDelta;
  post.accelerationSlope = accelerationSlope;
  post.momentumTrend = getMomentumTrend({
    post,
    previous,
    attentionMomentumDelta,
    shareVelocityDelta,
    quoteVelocityDelta,
    accelerationSlope,
  });

  if (post.momentumTrend === "reigniting") {
    post.riskFlags = (post.riskFlags || []).filter((flag) => flag !== "x_scout_candidate");
  }

  return post;
}

export function computePropagationMetrics(post) {
  const shares = Number(post.shareCount || 0);
  const quotes = Number(post.quoteCount || 0);
  const likes = Number(post.likeCount || 0);
  const repostVelocity = Number(post.repostVelocity || 0);
  const quoteVelocity = Number(post.quoteVelocity || 0);
  const shareVelocity = Number(post.shareVelocity || 0);
  const viewsPerHour = Number(post.viewsPerHour || 0);
  const engagementAcceleration = Number(post.engagementAcceleration || 0);
  const hoursActive = Number(post.hoursActive || 1);

  const repostBaseline = Math.max(0.1, Number(post.repostCount || 0) / Math.max(24, hoursActive * 2));
  const quoteBaseline = Math.max(0.1, quotes / Math.max(24, hoursActive * 2));
  const repostAcceleration = repostVelocity / repostBaseline;
  const quoteAcceleration = quoteVelocity / quoteBaseline;
  const propagationRatio = (shares + quotes) / Math.max(1, likes);
  const attentionMomentum =
    viewsPerHour +
    shareVelocity * 300 +
    quoteVelocity * 500 +
    repostVelocity * 200 +
    engagementAcceleration * 20;
  const saturationRisk = getSaturationRisk({ likes, viewsPerHour, propagationRatio, shareVelocity, quoteVelocity });

  return {
    repostAcceleration,
    quoteAcceleration,
    engagementAcceleration,
    propagationRatio,
    attentionMomentum: Math.round(attentionMomentum),
    saturationRisk,
  };
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
      label: "public fields with media",
      tweetFields: SAFE_TWEET_FIELDS,
      expansions: "author_id,attachments.media_keys",
      userFields: "username,name,public_metrics",
      mediaFields: "type,url,preview_image_url,width,height",
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

function normalizeTweet(tweet, usersById, mediaByKey, queryLane = "broad_media_stream") {
  const publicMetrics = tweet.public_metrics || {};
  const author = usersById.get(tweet.author_id);
  const authorFollowers = Number(author?.public_metrics?.followers_count || 0);
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
  const engagementAcceleration = getEngagementAcceleration({
    engagementPerHour,
    shareVelocity,
    quoteVelocity,
    repostVelocity,
    hoursActive,
  });
  const shareRate = shareCount / Math.max(1, totalViews);
  const quoteRate = quoteCount / Math.max(1, shareCount);
  const quoteToLikeRate = quoteCount / Math.max(1, likeCount);
  const likeRate = likeCount / Math.max(1, totalViews);
  const replyRate = replyCount / Math.max(1, totalViews);
  const crossCommunitySpreadScore = getCrossCommunitySpreadScore({
    shareRate,
    quoteRate,
    quoteVelocity,
    repostVelocity,
  });
  const cryptoSaturatedLanguage = riskFlags.includes("crypto_saturated_language");
  const keywordBias = getKeywordBias(text);
  const basePost = {
    shareCount,
    quoteCount,
    likeCount,
    repostCount,
    repostVelocity,
    quoteVelocity,
    shareVelocity,
    viewsPerHour,
    engagementAcceleration,
    hoursActive,
  };
  const propagation = computePropagationMetrics(basePost);
  const engagementToFollowerRate = authorFollowers > 0
    ? engagementCount / authorFollowers
    : 0;
  const accountOutperformanceScore = getAccountOutperformanceScore(engagementToFollowerRate);
  const quoteExplosion = isQuoteExplosion({
    quoteVelocity,
    quoteRate,
    quoteToLikeRate,
    quoteAcceleration: propagation.quoteAcceleration,
  });
  const marketabilityScore = getMarketabilityScore({
    text,
    hasMedia: media.length > 0,
    quoteExplosion,
    propagationRatio: propagation.propagationRatio,
    quoteVelocity,
    repostVelocity,
    shareVelocity,
    crossCommunitySpreadScore,
  });
  const discoveryLane = refineDiscoveryLane({
    queryLane,
    authorFollowers,
    engagementToFollowerRate,
    quoteExplosion,
    crossCommunitySpreadScore,
  });
  const shape = classifyViralShape({
    viewsPerHour,
    quoteVelocity,
    repostVelocity,
    shareVelocity,
    engagementAcceleration,
    propagationRatio: propagation.propagationRatio,
    saturationRisk: propagation.saturationRisk,
    totalViews,
    likeCount,
    hoursActive,
    crossCommunitySpreadScore,
  });
  const isRising =
    viewsPerHour >= config.x.minViewsPerHour ||
    shareVelocity >= config.x.minShareVelocity ||
    quoteVelocity >= config.x.minQuoteVelocity ||
    repostVelocity >= config.x.minRepostVelocity ||
    engagementAcceleration >= config.x.minEngagementAcceleration;
  const attentionShapeScore = getAttentionShapeScore({
    viewsPerHour,
    shareVelocity,
    quoteVelocity,
    repostVelocity,
    engagementPerHour,
    engagementAcceleration,
    crossCommunitySpreadScore,
    hasMedia: media.length > 0,
    cryptoSaturatedLanguage,
    keywordBias,
    accountOutperformanceScore,
    marketabilityScore,
    quoteExplosion,
  });

  const post = {
    id: `x-${tweet.id}`,
    sourcePlatform: "x",
    sourceUrl: `https://x.com/${author?.username || "i"}/status/${tweet.id}`,
    name: buildTitle(text, media.length > 0),
    text,
    author: author?.username || "unknown",
    authorName: author?.name || author?.username || "Unknown",
    authorFollowers,
    type: "post",
    hasMedia: media.length > 0,
    mediaType: media[0]?.type || null,
    mediaAttachments: media.map((item) => ({
      type: item.type || null,
      url: item.url || null,
      preview_image_url: item.preview_image_url || null,
      width: item.width || null,
      height: item.height || null,
    })),
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
    engagementAcceleration,
    repostAcceleration: propagation.repostAcceleration,
    quoteAcceleration: propagation.quoteAcceleration,
    propagationRatio: propagation.propagationRatio,
    attentionMomentum: propagation.attentionMomentum,
    saturationRisk: propagation.saturationRisk,
    crossCommunitySpreadScore,
    engagementToFollowerRate,
    accountOutperformanceScore,
    marketabilityScore,
    quoteExplosion,
    viralShape: shape.viralShape,
    viralShapeReason: shape.viralShapeReason,
    discoveryLane,
    momentumTrend: "stable",
    attentionMomentumDelta: 0,
    shareVelocityDelta: 0,
    quoteVelocityDelta: 0,
    accelerationSlope: 0,
    shareRate,
    quoteRate,
    quoteToLikeRate,
    likeRate,
    replyRate,
    engagementCount,
    viewsPerHour,
    engagementPerHour,
    attentionShapeScore,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: isRising ? 1.2 : 1,
    trendDirection: isRising ? "rising" : "stable",
    discoveredAt: new Date().toISOString(),
    earliestVideo: Math.floor(new Date(tweet.created_at).getTime() / 1000),
    riskFlags,
    cryptoSaturatedLanguage,
  };
  return applyLaunchWorthiness(post);
}

function passesFilters(post, tweet) {
  return !getFilterRejectionReason(post, tweet);
}

function getFilterRejectionReason(post, tweet) {
  if (tweet.lang && tweet.lang !== "en") return "non_english";
  if (tweet.possibly_sensitive) return "possibly_sensitive";
  if (isRetweetOrReply(tweet.text)) return "retweet_or_reply";

  const ageHours = getHoursSince(tweet.created_at);
  const meetsVelocityThreshold =
    post.shareVelocity >= config.x.minShareVelocity ||
    post.quoteVelocity >= config.x.minQuoteVelocity ||
    post.quoteAcceleration >= config.x.minQuoteAcceleration ||
    post.repostVelocity >= config.x.minRepostVelocity ||
    post.repostAcceleration >= config.x.minRepostAcceleration ||
    post.viewsPerHour >= config.x.minViewsPerHour ||
    post.engagementPerHour >= config.x.minEngagementPerHour ||
    post.engagementAcceleration >= config.x.minEngagementAcceleration ||
    post.attentionShapeScore >= config.x.minAttentionShapeScore;

  if (ageHours <= config.x.maxPostAgeHours) {
    return meetsVelocityThreshold ? null : "below_attention_thresholds";
  }

  const stillMoving =
    post.viewsPerHour >= config.x.minViewsPerHour ||
    post.shareVelocity >= config.x.minShareVelocity * 1.5 ||
    post.quoteVelocity >= config.x.minQuoteVelocity * 1.5 ||
    post.quoteAcceleration >= config.x.minQuoteAcceleration * 1.25 ||
    post.repostVelocity >= config.x.minRepostVelocity * 1.5 ||
    post.repostAcceleration >= config.x.minRepostAcceleration * 1.25 ||
    post.engagementAcceleration >= config.x.minEngagementAcceleration * 1.5 ||
    post.momentumTrend === "rising" ||
    post.momentumTrend === "reigniting" ||
    post.attentionShapeScore >= config.x.minAttentionShapeScore * 1.5;

  if (ageHours <= config.x.maxStrongPostAgeHours) {
    return stillMoving ? null : "below_attention_thresholds_after_fresh_window";
  }

  return `too_old_${Math.round(ageHours)}h`;
}

function getAttentionShapeScore({
  viewsPerHour,
  shareVelocity,
  quoteVelocity,
  repostVelocity,
  engagementPerHour,
  engagementAcceleration,
  crossCommunitySpreadScore,
  hasMedia,
  cryptoSaturatedLanguage,
  keywordBias,
  accountOutperformanceScore,
  marketabilityScore,
  quoteExplosion,
}) {
  let score =
    viewsPerHour +
    shareVelocity * 300 +
    quoteVelocity * 650 +
    repostVelocity * 275 +
    engagementPerHour * 20 +
    engagementAcceleration * 35 +
    crossCommunitySpreadScore * 1000;

  if (hasMedia) score *= 1.15;
  if (quoteExplosion) score *= 1.18;
  score *= 1 + Math.min(0.25, accountOutperformanceScore / 100);
  score *= 1 + Math.min(0.2, marketabilityScore / 500);
  score *= keywordBias;
  if (cryptoSaturatedLanguage) score *= 0.7;

  return Math.round(score);
}

function getEngagementAcceleration({
  engagementPerHour,
  shareVelocity,
  quoteVelocity,
  repostVelocity,
  hoursActive,
}) {
  const freshnessBoost = hoursActive <= 3 ? 1.5 : hoursActive <= 6 ? 1.25 : hoursActive <= 12 ? 1 : 0.75;
  return Math.round((engagementPerHour + shareVelocity * 5 + quoteVelocity * 8 + repostVelocity * 4) * freshnessBoost);
}

function getCrossCommunitySpreadScore({
  shareRate,
  quoteRate,
  quoteVelocity,
  repostVelocity,
}) {
  return Math.round((shareRate * 100 + quoteRate * 25 + quoteVelocity * 2 + repostVelocity) * 10) / 10;
}

function classifyViralShape({
  viewsPerHour,
  quoteVelocity,
  repostVelocity,
  shareVelocity,
  engagementAcceleration,
  propagationRatio,
  saturationRisk,
  totalViews,
  likeCount,
  hoursActive,
  crossCommunitySpreadScore,
}) {
  if (totalViews >= 1_000_000 && propagationRatio < 0.02 && quoteVelocity < config.x.minQuoteVelocity) {
    return {
      viralShape: "likely_bot_amplified",
      viralShapeReason: "Large reach with weak quote/share behavior.",
    };
  }

  if (saturationRisk >= 70) {
    return {
      viralShape: "saturated",
      viralShapeReason: "Large like base but weak propagation ratio.",
    };
  }

  if (viewsPerHour >= config.x.minViewsPerHour && quoteVelocity >= config.x.minQuoteVelocity) {
    return {
      viralShape: "explosive",
      viralShapeReason: "High views/hour and high quote velocity.",
    };
  }

  if (crossCommunitySpreadScore >= 150 && quoteVelocity >= config.x.minQuoteVelocity * 0.75) {
    return {
      viralShape: "cross_community",
      viralShapeReason: "Quote activity and spread indicate cross-community movement.",
    };
  }

  if (viewsPerHour < config.x.minViewsPerHour && (shareVelocity >= config.x.minShareVelocity || engagementAcceleration >= config.x.minEngagementAcceleration)) {
    return {
      viralShape: "compounding",
      viralShapeReason: "Moderate reach but accelerating shares and engagement.",
    };
  }

  if (hoursActive > config.x.maxPostAgeHours && (shareVelocity >= config.x.minShareVelocity || repostVelocity >= config.x.minRepostVelocity)) {
    return {
      viralShape: "slowburn",
      viralShapeReason: "Older post is still maintaining repost momentum.",
    };
  }

  if (likeCount > 0 && propagationRatio < 0.03) {
    return {
      viralShape: "low_conversion",
      viralShapeReason: "Engagement is not converting into reposts or quote chains.",
    };
  }

  return {
    viralShape: "compounding",
    viralShapeReason: "Attention shape is building through media engagement.",
  };
}

function isQuoteExplosion({ quoteVelocity, quoteRate, quoteToLikeRate, quoteAcceleration }) {
  return (
    quoteVelocity >= config.x.minQuoteVelocity * 2 ||
    quoteRate >= config.x.minQuoteRate ||
    quoteToLikeRate >= config.x.minQuoteToLikeRate ||
    quoteAcceleration >= config.x.minQuoteAcceleration * 2
  );
}

function getAccountOutperformanceScore(rate) {
  if (rate >= 0.1) return 30;
  if (rate >= 0.05) return 20;
  if (rate >= 0.03) return 12;
  return 0;
}

function getMarketabilityScore({
  text,
  hasMedia,
  quoteExplosion,
  propagationRatio,
  quoteVelocity,
  repostVelocity,
  shareVelocity,
  crossCommunitySpreadScore,
}) {
  const cleaned = cleanTweetText(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  let score = 0;

  if (hasMedia) score += 20;
  if (words.length > 0 && words.length <= 8) score += 15;
  else if (words.length <= 14) score += 8;
  if (quoteExplosion) score += 20;
  if (propagationRatio >= 0.25) score += 15;
  else if (propagationRatio >= 0.12) score += 10;
  if (quoteVelocity >= config.x.minQuoteVelocity) score += 15;
  if (repostVelocity >= config.x.minRepostVelocity) score += 10;
  if (shareVelocity >= config.x.minShareVelocity) score += 10;
  if (crossCommunitySpreadScore >= 150) score += 15;

  return Math.min(100, score);
}

function refineDiscoveryLane({
  queryLane,
  authorFollowers,
  engagementToFollowerRate,
  quoteExplosion,
  crossCommunitySpreadScore,
}) {
  if (queryLane === "trusted_viral_accounts") return "trusted_viral_accounts";
  if (quoteExplosion) return "quote_explosion_watch";
  if (crossCommunitySpreadScore >= 150) return "broad_media_stream";
  if (authorFollowers > 0 && authorFollowers <= 100_000 && engagementToFollowerRate >= 0.03) return "emerging_accounts";
  return queryLane || "broad_media_stream";
}

function getSaturationRisk({
  likes,
  viewsPerHour,
  propagationRatio,
  shareVelocity,
  quoteVelocity,
}) {
  let risk = 0;
  if (likes >= 100_000 && propagationRatio < 0.04) risk += 35;
  if (viewsPerHour >= 500_000 && shareVelocity < config.x.minShareVelocity * 0.5) risk += 25;
  if (quoteVelocity < config.x.minQuoteVelocity * 0.25) risk += 20;
  if (propagationRatio < 0.02) risk += 20;
  return Math.min(100, risk);
}

function getMomentumTrend({
  post,
  previous,
  attentionMomentumDelta,
  shareVelocityDelta,
  quoteVelocityDelta,
  accelerationSlope,
}) {
  if (!previous?.attentionMomentum) {
    if (post.quoteExplosion || post.viralShape === "explosive") return "rising";
    return "stable";
  }

  const previousMomentum = Math.max(1, Number(previous.attentionMomentum || 0));
  const momentumChange = attentionMomentumDelta / previousMomentum;

  if (momentumChange >= 0.4 && Number(previous.attentionMomentum || 0) < config.x.minAttentionShapeScore) {
    return "reigniting";
  }
  if (momentumChange >= 0.12 || quoteVelocityDelta > 0 || shareVelocityDelta > 0 || accelerationSlope > 0) {
    return "rising";
  }
  if (momentumChange <= -0.25 && quoteVelocityDelta <= 0 && shareVelocityDelta <= 0) {
    return "decaying";
  }
  return "stable";
}

function delta(current, previous) {
  return Number(current || 0) - Number(previous || 0);
}

function getKeywordBias(text = "") {
  const lower = text.toLowerCase();
  const slightBoostTerms = ["video", "clip", "photo", "picture", "watch", "look"];
  return slightBoostTerms.some((term) => lower.includes(term)) ? 1.03 : 1;
}

function buildTrustedAccountQuery(accounts) {
  const accountQuery = accounts.map((account) => `from:${account}`).join(" OR ");
  return `(the OR this OR video OR clip OR watch) (${accountQuery}) lang:en -is:retweet -is:reply`;
}

function logAcceptedPost(post) {
  console.log(
    `      Accepted X: ${post.viralShape}/${post.momentumTrend} ` +
    `lane=${post.discoveryLane} momentum=${formatMetric(post.attentionMomentum)} ` +
    `prop=${post.propagationRatio.toFixed(3)} quoteExplosion=${post.quoteExplosion ? "yes" : "no"} ` +
    `eng/follow=${post.engagementToFollowerRate.toFixed(4)}`
  );
}

function formatMetric(value) {
  return Math.round(Number(value || 0)).toLocaleString();
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
