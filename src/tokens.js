// ============================================================
// TOKEN MATCHER
// ============================================================
// Cross-references DexScreener + Birdeye to check if a token
// already exists for a given trend.
//
// DexScreener API = free, no key needed
// Birdeye API = free tier available
// ============================================================

import { config } from "./config.js";

const GENERIC_MATCH_TERMS = new Set([
  "law",
  "cat",
  "ai",
  "dog",
  "base",
  "meme",
  "coin",
  "official",
  "finance",
  "token",
  "crypto",
  "viral",
  "trend",
  "the",
  "this",
  "that",
  "what",
  "video",
  "clip",
]);

const TRUSTED_CHAINS = new Set(["SOL", "ETH", "BASE"]);

/**
 * Search DexScreener for tokens matching a trend name
 * Returns the best match with market data
 */
async function searchDexScreener(trendName) {
  // Clean the trend name into search terms
  // "#aigirlfriend breakup" -> "aigirlfriend"
  // "moo deng remix - @user" -> "moo deng"
  const searchTerm = cleanSearchTerm(trendName);

  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(searchTerm)}`
    );

    // DexScreener returns HTML when rate limited
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.log(`   ⏳ DexScreener rate limited, skipping`);
      return [];
    }

    const data = await res.json();

    if (!data.pairs || data.pairs.length === 0) return [];

    return data.pairs
      .filter((p) => {
        const liq = p.liquidity?.usd || 0;
        return liq > 1000;
      })
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 8)
      .map((best) => ({
      source: "dexscreener",
      tokenName: best.baseToken?.name || best.baseToken?.symbol || "???",
      tokenSymbol: best.baseToken?.symbol || "???",
      tokenAddress: best.baseToken?.address || "",
      chain: mapChainName(best.chainId),
      pairAddress: best.pairAddress,
      priceUsd: best.priceUsd,
      marketCap: best.marketCap || best.fdv || 0,
      volume24h: best.volume?.h24 || 0,
      liquidity: best.liquidity?.usd || 0,
      priceChange24h: best.priceChange?.h24 || 0,
      holders: null, // DexScreener doesn't provide this
      url: best.url || `https://dexscreener.com/${best.chainId}/${best.pairAddress}`,
      createdAt: best.pairCreatedAt,
    }));
  } catch (err) {
    console.error("❌ DexScreener search failed:", err.message);
    return [];
  }
}

/**
 * Search Birdeye for Solana tokens matching a trend
 * Better for Solana memecoins / pump.fun tokens
 */
async function searchBirdeye(trendName) {
  if (!config.birdeye.apiKey) return [];

  const searchTerm = cleanSearchTerm(trendName);

  try {
    const res = await fetch(
      `https://public-api.birdeye.so/defi/v3/search?chain=solana&keyword=${encodeURIComponent(searchTerm)}&target=token&sort_by=volume_24h_usd&sort_type=desc&limit=5`,
      {
        headers: {
          "X-API-KEY": config.birdeye.apiKey,
          accept: "application/json",
        },
      }
    );
    const data = await res.json();

    if (!data.data?.items || data.data.items.length === 0) return [];

    return data.data.items
      .filter((t) => (t.liquidity || 0) > 1000)
      .slice(0, 8)
      .map((token) => ({
      source: "birdeye",
      tokenName: token.name || token.symbol || "???",
      tokenSymbol: token.symbol || "???",
      tokenAddress: token.address || "",
      chain: "SOL",
      pairAddress: null,
      priceUsd: token.price?.toString() || "0",
      marketCap: token.market_cap || 0,
      volume24h: token.volume_24h_usd || 0,
      liquidity: token.liquidity || 0,
      priceChange24h: token.price_change_24h_percent || 0,
      holders: token.holder || null,
      url: `https://birdeye.so/token/${token.address}?chain=solana`,
      createdAt: null,
    }));
  } catch (err) {
    console.error("❌ Birdeye search failed:", err.message);
    return [];
  }
}

/**
 * Main export: find a token for a trend
 * Checks DexScreener first (multi-chain), then Birdeye (Solana-specific)
 * Returns the best match or null
 */
export async function findToken(trendOrName) {
  if (!config.tokenMatching.enabled) {
    console.log("🔍 Existing token matching disabled");
    return null;
  }

  const trend = normalizeTrendInput(trendOrName);
  console.log(`🔍 Searching for canonical market: "${trend.name}"`);

  // Run both in parallel
  const [dexResults, birdeyeResults] = await Promise.all([
    searchDexScreener(trend.name),
    searchBirdeye(trend.name),
  ]);

  const evaluated = [...dexResults, ...birdeyeResults]
    .map((token) => {
      const diagnostics = computeTokenMatchConfidence(trend, token);
      return { ...token, ...diagnostics };
    })
    .sort((a, b) => b.matchConfidence - a.matchConfidence);

  if (evaluated.length === 0) {
    console.log(`❌ NO TOKEN FOUND for "${trend.name}"`);
    markLaunchOpportunity(trend, null);
    return null;
  }

  for (const candidate of evaluated.slice(0, 5)) {
    logTokenDiagnostics(candidate);
  }

  const best = evaluated[0];
  if (best.rejected || best.matchConfidence < config.tokenMatching.possibleThreshold) {
    console.log(`❌ NO TOKEN FOUND for "${trend.name}"`);
    markLaunchOpportunity(trend, null);
    return null;
  }

  if (best.matchConfidence < config.tokenMatching.confidenceThreshold) {
    console.log(`⚠️  POSSIBLE MARKET DETECTED: ${best.tokenName} (${best.tokenSymbol}) confidence=${best.matchConfidence.toFixed(2)}; CA withheld`);
    markLaunchOpportunity(trend, best);
    return {
      ...best,
      matchStatus: "possible",
      tokenAddress: null,
      pairAddress: null,
    };
  }

  console.log(`✅ CANONICAL MARKET FOUND: ${best.tokenName} (${best.tokenSymbol}) on ${best.chain} confidence=${best.matchConfidence.toFixed(2)}`);
  trend.launchOpportunity = false;
  return {
    ...best,
    matchStatus: "canonical",
  };
}

export function computeTokenMatchConfidence(post, token) {
  const context = buildEntityContext(post);
  const tokenContext = buildTokenContext(token);
  const factors = [];
  const rejectionReasons = [];
  let score = 0;

  const exactPhraseMatches = context.phrases.filter((phrase) => tokenContext.normalized.includes(phrase));
  if (exactPhraseMatches.length > 0) {
    score += 0.35;
    factors.push(`exact_phrase:${exactPhraseMatches.slice(0, 2).join("|")}`);
  }

  const canonicalMatches = context.canonicalEntities.filter((entity) => tokenContext.normalized.includes(entity));
  if (canonicalMatches.length > 0) {
    score += Math.min(0.35, canonicalMatches.length * 0.18);
    factors.push(`canonical_entity:${canonicalMatches.slice(0, 3).join("|")}`);
  }

  const titleOverlap = overlapScore(context.titleTerms, tokenContext.strongTerms);
  if (titleOverlap > 0) {
    score += Math.min(0.16, titleOverlap * 0.16);
    factors.push(`title_overlap:${titleOverlap.toFixed(2)}`);
  }

  const tickerOverlap = tickerOverlapScore(context, tokenContext);
  if (tickerOverlap > 0) {
    score += Math.min(0.12, tickerOverlap * 0.12);
    factors.push(`ticker_overlap:${tickerOverlap.toFixed(2)}`);
  }

  const authorOverlap = context.authorTerms.length > 0
    ? overlapScore(context.authorTerms, tokenContext.strongTerms)
    : 0;
  if (authorOverlap > 0) {
    score += Math.min(0.08, authorOverlap * 0.08);
    factors.push(`author_overlap:${authorOverlap.toFixed(2)}`);
  }

  const legitimacy = getMarketLegitimacyScore(token, rejectionReasons);
  score += legitimacy.score;
  factors.push(...legitimacy.factors);

  const spam = getSpamPenalty(token, tokenContext, context);
  score -= spam.penalty;
  rejectionReasons.push(...spam.reasons);

  if (context.strongTerms.length === 0) {
    score -= 0.3;
    rejectionReasons.push("no strong canonical source terms");
  }

  if (canonicalMatches.length === 0 && exactPhraseMatches.length === 0 && titleOverlap < 0.5) {
    score -= 0.35;
    rejectionReasons.push("no canonical phrase/entity alignment");
  }

  const matchConfidence = clamp01(score);
  const rejected = shouldRejectToken({ token, matchConfidence, rejectionReasons, tokenContext, context });

  return {
    matchConfidence,
    matchingFactors: factors,
    rejectionReasons,
    rejected,
  };
}

// ----------------------------------------------------------
// HELPERS
// ----------------------------------------------------------

/**
 * Clean a trend name into a searchable term
 * "#aigirlfriend breakup" -> "aigirlfriend"
 * "moo deng remix - @cryptodegen42" -> "moo deng"
 * "cat in jar sound" -> "cat jar" or "catjar"
 */
function cleanSearchTerm(name) {
  return (
    name
      // Remove hashtags
      .replace(/#/g, "")
      // Remove @mentions and everything after
      .replace(/-?\s*@\w+.*$/, "")
      // Remove common filler words for better search
      .replace(/\b(sound|remix|original|trend|meme|dance|challenge)\b/gi, "")
      // Remove extra whitespace
      .replace(/\s+/g, " ")
      .trim()
      // Take first 3 meaningful words max
      .split(" ")
      .filter((w) => w.length > 1)
      .slice(0, 3)
      .join(" ")
  );
}

function normalizeTrendInput(input) {
  if (typeof input === "string") {
    return { name: input, text: input, author: "", sourcePlatform: "unknown" };
  }
  if (!input.name) input.name = input.text || "unknown";
  if (!input.text) input.text = input.name || "";
  if (!input.author) input.author = "";
  return input;
}

function buildEntityContext(post) {
  const text = `${post.name || ""} ${post.text || ""}`;
  const clean = normalizeText(text);
  const titleTerms = getStrongTerms(clean);
  const authorTerms = getStrongTerms(post.author || "");
  const canonicalEntities = extractCanonicalEntities(text);
  const phrases = extractUniquePhrases(text);
  const strongTerms = [...new Set([...titleTerms, ...canonicalEntities.flatMap((entity) => entity.split(" "))])];

  return {
    normalized: clean,
    titleTerms,
    authorTerms,
    canonicalEntities,
    phrases,
    strongTerms: strongTerms.filter((term) => !GENERIC_MATCH_TERMS.has(term)),
  };
}

function buildTokenContext(token) {
  const symbol = token.tokenSymbol || token.tokenName || "";
  const name = token.tokenName || "";
  const normalized = normalizeText(`${name} ${symbol}`);
  const strongTerms = getStrongTerms(normalized);
  return {
    normalized,
    symbol: normalizeText(symbol).replace(/\s+/g, ""),
    name: normalizeText(name),
    strongTerms,
  };
}

function extractCanonicalEntities(text = "") {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, "");
  const entities = [];
  const titleCasePhrases = withoutUrls.match(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}\b/g) || [];
  for (const phrase of titleCasePhrases) {
    const normalized = normalizeText(phrase);
    const terms = getStrongTerms(normalized);
    if (terms.length > 0) entities.push(terms.join(" "));
  }

  const hashtags = withoutUrls.match(/#[A-Za-z0-9_]{4,}/g) || [];
  for (const tag of hashtags) {
    const normalized = normalizeText(tag.replace("#", ""));
    if (!GENERIC_MATCH_TERMS.has(normalized)) entities.push(normalized);
  }

  return [...new Set(entities)].slice(0, 8);
}

function extractUniquePhrases(text = "") {
  const clean = normalizeText(text);
  const words = clean.split(/\s+/).filter((word) => word && !GENERIC_MATCH_TERMS.has(word));
  const phrases = [];
  for (let size = 3; size >= 2; size--) {
    for (let i = 0; i <= words.length - size; i++) {
      phrases.push(words.slice(i, i + size).join(" "));
    }
  }
  return [...new Set(phrases)].slice(0, 12);
}

function getStrongTerms(text = "") {
  return normalizeText(text)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .filter((term) => !GENERIC_MATCH_TERMS.has(term));
}

function normalizeText(text = "") {
  return String(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/#(\w+)/g, "$1")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function overlapScore(sourceTerms, tokenTerms) {
  const source = new Set(sourceTerms.filter((term) => !GENERIC_MATCH_TERMS.has(term)));
  const target = new Set(tokenTerms.filter((term) => !GENERIC_MATCH_TERMS.has(term)));
  if (source.size === 0 || target.size === 0) return 0;
  let matches = 0;
  for (const term of source) {
    if (target.has(term)) matches += 1;
  }
  return matches / Math.max(1, source.size);
}

function tickerOverlapScore(context, tokenContext) {
  if (!tokenContext.symbol || tokenContext.symbol.length < 2) return 0;
  const compactPhrases = [...context.canonicalEntities, ...context.phrases]
    .map((phrase) => phrase.replace(/\s+/g, ""))
    .filter(Boolean);
  if (compactPhrases.some((phrase) => phrase === tokenContext.symbol)) return 1;
  if (context.strongTerms.includes(tokenContext.symbol)) return 0.7;
  if (GENERIC_MATCH_TERMS.has(tokenContext.symbol)) return 0;
  if (tokenContext.symbol.length <= 4 && context.normalized.includes(tokenContext.symbol)) return 0.4;
  return 0;
}

function getMarketLegitimacyScore(token, rejectionReasons) {
  const liquidity = Number(token.liquidity || 0);
  const volume = Number(token.volume24h || 0);
  const marketCap = Number(token.marketCap || 0);
  const holders = Number(token.holders || 0);
  const ageHours = getTokenAgeHours(token);
  let score = 0;
  const factors = [];

  if (liquidity >= 100_000) {
    score += 0.08;
    factors.push("liquidity_strong");
  } else if (liquidity >= 25_000) {
    score += 0.04;
    factors.push("liquidity_ok");
  }

  if (volume >= 250_000) {
    score += 0.06;
    factors.push("volume_strong");
  } else if (volume >= 50_000) {
    score += 0.03;
    factors.push("volume_ok");
  }

  if (marketCap >= 1_000_000) {
    score += 0.04;
    factors.push("market_persistence");
  }

  if (holders >= 500) {
    score += 0.04;
    factors.push("holder_base");
  } else if (holders > 0 && holders < 100) {
    rejectionReasons.push("low holder count");
  }

  if (ageHours !== null) {
    if (ageHours >= 24) {
      score += 0.04;
      factors.push("age_over_24h");
    } else if (liquidity < 25_000) {
      rejectionReasons.push("age < 24h and liquidity weak");
    }
  }

  if (TRUSTED_CHAINS.has(token.chain)) {
    score += 0.02;
    factors.push(`trusted_chain:${token.chain}`);
  }

  if (token.url) {
    score += 0.02;
    factors.push("social_or_market_presence");
  }

  return { score, factors };
}

function getSpamPenalty(token, tokenContext, context) {
  const reasons = [];
  let penalty = 0;
  const symbol = tokenContext.symbol;
  const name = tokenContext.name;
  const liquidity = Number(token.liquidity || 0);
  const volume = Number(token.volume24h || 0);

  if (symbol.length > 12 || /([a-z0-9])\1{3,}/i.test(symbol)) {
    penalty += 0.2;
    reasons.push("suspicious ticker stuffing");
  }

  if (/\b(v2|cto|official|real|new|moon|100x|pump|inu|wif)\b/i.test(name)) {
    penalty += 0.18;
    reasons.push("obvious narrative hijacking");
  }

  const tokenTerms = tokenContext.strongTerms;
  if (tokenTerms.length > 0 && tokenTerms.every((term) => GENERIC_MATCH_TERMS.has(term))) {
    penalty += 0.35;
    reasons.push("generic-word-only match");
  }

  const volumeLiquidityRatio = volume / Math.max(1, liquidity);
  if (liquidity < 10_000 && volumeLiquidityRatio > 20) {
    penalty += 0.18;
    reasons.push("weak volume/liquidity ratio");
  }

  const strongOverlap = overlapScore(context.strongTerms, tokenTerms);
  if (strongOverlap === 0) {
    penalty += 0.25;
    reasons.push("duplicate meme variant or unrelated token");
  }

  return { penalty, reasons };
}

function shouldRejectToken({ token, matchConfidence, rejectionReasons, tokenContext, context }) {
  const liquidity = Number(token.liquidity || 0);
  const ageHours = getTokenAgeHours(token);
  if (ageHours !== null && ageHours < 24 && liquidity < 25_000) return true;
  if (matchConfidence < config.tokenMatching.possibleThreshold) return true;
  if (rejectionReasons.includes("generic-word-only match")) return true;
  if (rejectionReasons.includes("no canonical phrase/entity alignment")) return true;
  if (overlapScore(context.strongTerms, tokenContext.strongTerms) === 0) return true;
  return false;
}

function getTokenAgeHours(token) {
  if (!token.createdAt) return null;
  const created = Number(token.createdAt);
  if (!created) return null;
  return Math.max(0, (Date.now() - created) / 3600000);
}

function markLaunchOpportunity(trend, possibleToken) {
  if (trend.sourcePlatform === "x" && config.tokenMatching.launchIfNoMarket) {
    trend.launchOpportunity = true;
    if (possibleToken?.matchStatus === "possible") trend.possibleMarket = possibleToken;
  }
}

function logTokenDiagnostics(token) {
  console.log(
    `   Token candidate: ${token.tokenName} (${token.tokenSymbol}) ` +
    `confidence=${token.matchConfidence.toFixed(2)} ` +
    `factors=[${token.matchingFactors.join(", ") || "none"}] ` +
    `reject=[${token.rejectionReasons.join(", ") || "none"}]`
  );
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Map DexScreener chain IDs to readable names
 */
function mapChainName(chainId) {
  const map = {
    solana: "SOL",
    ethereum: "ETH",
    bsc: "BSC",
    base: "BASE",
    arbitrum: "ARB",
    polygon: "MATIC",
    avalanche: "AVAX",
  };
  return map[chainId] || chainId?.toUpperCase() || "???";
}

/**
 * Format large numbers for display
 */
export function formatNumber(num) {
  if (!num) return "0";
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export function formatCount(num) {
  if (!num) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
