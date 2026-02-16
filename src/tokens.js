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
    const data = await res.json();

    if (!data.pairs || data.pairs.length === 0) return null;

    // Filter for relevant results:
    // - Must have some liquidity (> $5K to avoid total rugs)
    // - Sort by volume to find the "real" one
    const validPairs = data.pairs
      .filter((p) => {
        const liq = p.liquidity?.usd || 0;
        return liq > 5000;
      })
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));

    if (validPairs.length === 0) return null;

    const best = validPairs[0];

    return {
      source: "dexscreener",
      tokenName: best.baseToken?.symbol || "???",
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
    };
  } catch (err) {
    console.error("❌ DexScreener search failed:", err.message);
    return null;
  }
}

/**
 * Search Birdeye for Solana tokens matching a trend
 * Better for Solana memecoins / pump.fun tokens
 */
async function searchBirdeye(trendName) {
  if (!config.birdeye.apiKey) return null;

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

    if (!data.data?.items || data.data.items.length === 0) return null;

    // Find best match with real liquidity
    const token = data.data.items.find(
      (t) => (t.liquidity || 0) > 5000
    );
    if (!token) return null;

    return {
      source: "birdeye",
      tokenName: token.symbol || "???",
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
    };
  } catch (err) {
    console.error("❌ Birdeye search failed:", err.message);
    return null;
  }
}

/**
 * Main export: find a token for a trend
 * Checks DexScreener first (multi-chain), then Birdeye (Solana-specific)
 * Returns the best match or null
 */
export async function findToken(trendName) {
  console.log(`🔍 Searching for token: "${trendName}"`);

  // Run both in parallel
  const [dexResult, birdeyeResult] = await Promise.all([
    searchDexScreener(trendName),
    searchBirdeye(trendName),
  ]);

  // If both found results, prefer the one with more volume
  if (dexResult && birdeyeResult) {
    const best =
      dexResult.volume24h >= birdeyeResult.volume24h
        ? dexResult
        : birdeyeResult;
    console.log(
      `✅ Token found: ${best.tokenName} on ${best.chain} (${best.source})`
    );
    return best;
  }

  const result = dexResult || birdeyeResult;
  if (result) {
    console.log(
      `✅ Token found: ${result.tokenName} on ${result.chain} (${result.source})`
    );
  } else {
    console.log(`⚠️  No token found for "${trendName}"`);
  }

  return result;
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
