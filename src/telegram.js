// ============================================================
// TELEGRAM ALERTS — v4 (with Refresh button)
// ============================================================

import { Bot, InlineKeyboard } from "grammy";
import { config } from "./config.js";
import { getConviction } from "./scoring.js";
import { scoreTrend } from "./scoring.js";
import { formatNumber, formatCount } from "./tokens.js";
import { findToken } from "./tokens.js";
import { getViewsPerHour, getHoursActive } from "./tiktok.js";
import { getBuybackSummary } from "./buybacks.js";
import https from "node:https";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "tiktok-creative-center-api.p.rapidapi.com";

let bot = null;

export function initBot() {
  bot = new Bot(config.telegram.botToken);

  bot.command("start", (ctx) =>
    ctx.reply(
      "🐷 OINK\n\nTikTok attention → internet-native markets.\n\nJoin the channel for alerts!",
      { parse_mode: "Markdown" }
    )
  );

  bot.command("status", (ctx) =>
    ctx.reply("✅ OINK is running. Scanning every 15 minutes.")
  );

  // ---- REFRESH BUTTON HANDLER ----
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith("ref:")) return;

    const hashtagName = data.slice(4); // remove "ref:"
    console.log(`🔄 Refresh requested for #${hashtagName}`);

    try {
      await ctx.answerCallbackQuery({ text: "Refreshing..." });

      // Re-fetch fresh data from TikTok
      const freshTrend = await fetchSingleTrend(hashtagName);

      if (!freshTrend) {
        await ctx.answerCallbackQuery({ text: "Trend no longer in top 100" });
        return;
      }

      // Re-score
      const score = scoreTrend(freshTrend);

      // Re-check token
      const token = await findToken(freshTrend.name);

      // Build updated message
      const message = formatAlertMessage({ trend: freshTrend, score, token });

      // Edit the original message in place
      await ctx.editMessageText(message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildRefreshKeyboard(hashtagName),
      });

      console.log(`✅ Refreshed #${hashtagName} — score: ${score.total}`);
    } catch (err) {
      console.error(`❌ Refresh failed for #${hashtagName}:`, err.message);
      try {
        await ctx.answerCallbackQuery({ text: "Refresh failed, try again" });
      } catch (_) {}
    }
  });

  return bot;
}

/**
 * Build the inline keyboard with refresh button
 */
function buildRefreshKeyboard(hashtagName) {
  // Telegram callback data max 64 bytes — keep it short
  const callbackData = `ref:${hashtagName.slice(0, 58)}`;
  return new InlineKeyboard().text("🔄 Refresh", callbackData);
}

/**
 * Fetch a single trend by name from TikTok Creative Center
 */
async function fetchSingleTrend(hashtagName) {
  try {
    // Search all 5 pages to find it
    for (let page = 1; page <= 5; page++) {
      const results = await fetchTrendingPage(page, 20);
      const match = results.find(
        (t) => t.hashtag_name.toLowerCase() === hashtagName.toLowerCase()
      );
      if (match) return transformHashtag(match);
    }
    return null;
  } catch (err) {
    console.error("❌ fetchSingleTrend failed:", err.message);
    return null;
  }
}

/**
 * Fetch a page of trending hashtags
 */
function fetchTrendingPage(page, limit) {
  return new Promise((resolve, reject) => {
    const path = `/api/trending/hashtag?period=7&limit=${limit}&page=${page}&country_code=US`;
    const options = {
      hostname: RAPIDAPI_HOST,
      path,
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
          resolve(json?.data?.list || []);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

/**
 * Transform raw API data into our trend format (same as tiktok.js)
 */
function transformHashtag(item) {
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

  return {
    id: `hashtag-${item.hashtag_id}`,
    name: `#${item.hashtag_name}`,
    type: "hashtag",
    totalViews: item.video_views || 0,
    videoCount: item.publish_cnt || 0,
    rank: item.rank || 999,
    rankChange: item.rank_diff || 0,
    rankChangeType: item.rank_diff_type,
    acceleration,
    trendDirection,
    trendCurve,
    earliestVideo: trendCurve[0]?.time || 0,
    discoveredAt: new Date().toISOString(),
  };
}

/**
 * Send alert with refresh button
 */
export async function sendAlert({ trend, score, token, isNewEntry = false }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatAlertMessage({ trend, score, token, isNewEntry });

  // Extract hashtag name for refresh callback
  const hashtagName = trend.name.replace("#", "");
  const keyboard = buildRefreshKeyboard(hashtagName);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bot.api.sendMessage(config.telegram.channelId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
      console.log(`📤 Alert sent: ${trend.name} (score: ${score.total})`);
      return true;
    } catch (err) {
      if (err.message?.includes("429") || err.message?.includes("Too Many Requests")) {
        const match = err.message.match(/retry after (\d+)/);
        const waitSec = match ? parseInt(match[1]) + 1 : 5 * attempt;
        console.log(`   ⏳ Rate limited, waiting ${waitSec}s (attempt ${attempt}/3)...`);
        await sleep(waitSec * 1000);
      } else {
        console.error("❌ Failed to send alert:", err.message);
        return false;
      }
    }
  }

  console.error("❌ Failed after 3 retries for:", trend.name);
  return false;
}

function formatAlertMessage({ trend, score, token, isNewEntry = false }) {
  const conviction = getConviction(score.total);
  const bars = "█".repeat(Math.round(score.total / 10)) +
               "░".repeat(10 - Math.round(score.total / 10));

  const viewsPerHourStr = formatCount(score.metrics.viewsPerHour);
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York" });

  let msg = "";

  // Header
  if (isNewEntry) {
    msg += `🆕 <b>NEW TREND JUST ENTERED TOP 100</b>\n\n`;
  }
  msg += `${conviction.emoji} <b>OINK ATTENTION ALERT</b>\n\n`;

  // Score
  msg += `🎯 SCORE: <b>${score.total}</b>/100\n`;
  msg += `<code>${bars}</code>\n\n`;

  // Source data
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (trend.sourcePlatform === "x") {
    msg += `𝕏 <b>VIRAL X POST</b>\n`;
    msg += `<b><a href="${escapeHtml(trend.sourceUrl)}">${escapeHtml(trend.name)}</a></b>\n`;
    if (trend.author) msg += `by @${escapeHtml(trend.author)}\n`;
  } else if (trend.type === "song") {
    msg += `🎵 <b>TIKTOK TRENDING SOUND</b>\n`;
    const songName = escapeHtml(trend.name);
    msg += `<b>${songName}</b>\n`;
    if (trend.artist) msg += `by ${escapeHtml(trend.artist)}\n`;
  } else {
    msg += `📱 <b>TIKTOK TREND</b>\n`;
    const cleanName = trend.name.replace("#", "");
    msg += `<b><a href="https://www.tiktok.com/tag/${encodeURIComponent(cleanName)}">${escapeHtml(trend.name)}</a></b>\n`;
  }

  // Trend direction
  const arrow = trend.trendDirection === "rising" ? "📈 Rising" :
                trend.trendDirection === "falling" ? "📉 Falling" : "➡️ Stable";
  msg += `${arrow}`;
  if (trend.rank) msg += ` | Rank #${trend.rank}`;
  if (trend.rankChange && trend.rankChangeType === 1) msg += ` (↑${trend.rankChange})`;
  msg += `\n\n`;

  // Key metrics
  msg += `<code>`;
  if (trend.type === "song") {
    msg += `🎤 Artist:       ${escapeHtml(trend.artist || "Original Sound")}\n`;
    msg += `📊 Song Rank:    #${trend.rank}\n`;
    if (trend.duration) msg += `⏱ Duration:     ${trend.duration}s\n`;
  } else if (trend.sourcePlatform === "x") {
    msg += `⚡ Views/hour:   ${viewsPerHourStr}\n`;
    msg += `👁 Est. views:   ${formatCount(trend.totalViews)}\n`;
    msg += `❤️ Likes:        ${formatCount(trend.likeCount)}\n`;
    msg += `🔁 Reposts:      ${formatCount(trend.repostCount)}\n`;
    msg += `💬 Replies:      ${formatCount(trend.replyCount)}\n`;
    msg += `🧲 Eng/hr:       ${formatCount(trend.engagementPerHour)}\n`;
  } else {
    msg += `⚡ Views/hour:   ${viewsPerHourStr}\n`;
    msg += `👁 Total views:   ${formatCount(trend.totalViews)}\n`;
    msg += `🎬 Videos made:   ${formatCount(trend.videoCount)}\n`;
  }
  msg += `</code>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Token data
  if (token) {
    msg += `✅ <b>TOKEN FOUND</b>\n`;
    msg += `<b>${escapeHtml(token.tokenName)}</b> <code>${token.chain}</code>\n\n`;

    msg += `<code>`;
    msg += `💰 MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `📊 24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `💧 Liquidity: ${formatNumber(token.liquidity)}\n`;
    if (token.holders) msg += `👥 Holders:   ${formatCount(token.holders)}\n`;
    msg += `📈 24h:       ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h.toFixed(1)}%\n`;
    msg += `</code>\n\n`;

    // CA — tap to copy
    msg += `📋 CA: <code>${token.tokenAddress}</code>\n\n`;

    // Trade links with ref
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔗 <b>Trade (save 40% on fees):</b>\n`;
    msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
    msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
    msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
    msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>`;
    msg += ` | <a href="${token.url}">DS</a>\n`;
  } else {
    msg += `⚠️ <b>NO TOKEN YET</b>\n\n`;
    msg += `No matching token found.\n`;
    msg += `OINK is watching for launch potential.\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔗 <b>Trade (save 40% on fees):</b>\n`;
    msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
    msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
    msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
    msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>`;
    msg += ` | <a href="https://pump.fun">pump.fun</a>\n`;
  }

  // Last updated timestamp
  msg += `\n<i>Updated: ${timeStr} ET</i>`;

  return msg;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send a trending digest — top trends summary
 */
export async function sendDigest(trends, scores) {
  if (!bot) throw new Error("Bot not initialized");

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York" });

  let msg = `📊 <b>OINK TRENDING DIGEST</b>\n`;
  msg += `<i>${timeStr} ET</i>\n\n`;

  // Top 10 trends
  const top = scores.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const { trend, score } = top[i];
    const arrow = trend.trendDirection === "rising" ? "📈" :
                  trend.trendDirection === "falling" ? "📉" : "➡️";
    if (trend.sourcePlatform === "x") {
      msg += `${i + 1}. <a href="${escapeHtml(trend.sourceUrl)}">${escapeHtml(trend.name)}</a>`;
    } else if (trend.type === "song") {
      msg += `${i + 1}. 🎵 ${escapeHtml(trend.name)}`;
    } else {
      const cleanName = trend.name.replace("#", "");
      msg += `${i + 1}. <a href="https://www.tiktok.com/tag/${encodeURIComponent(cleanName)}">${escapeHtml(trend.name)}</a>`;
    }
    msg += ` — <b>${score.total}</b>/100 ${arrow}\n`;
    if (trend.sourcePlatform === "x") {
      msg += `   ${formatCount(score.metrics.viewsPerHour)} v/hr | ${formatCount(trend.engagementCount)} engagements`;
    } else if (trend.type === "song") {
      msg += `   ${escapeHtml(trend.artist || "Original Sound")} | #${trend.rank}`;
    } else {
      msg += `   ${formatCount(score.metrics.viewsPerHour)} v/hr | ${formatCount(trend.videoCount)} videos`;
      if (trend.rank) msg += ` | #${trend.rank}`;
    }
    msg += `\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔗 <b>Trade (save 40% on fees):</b>\n`;
  msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
  msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
  msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
  msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>\n`;
  msg += `\n<i>Next digest in 3 hours</i>`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bot.api.sendMessage(config.telegram.channelId, msg, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      console.log(`📊 Digest sent — ${top.length} trends`);
      return true;
    } catch (err) {
      if (err.message?.includes("429")) {
        const match = err.message.match(/retry after (\d+)/);
        const waitSec = match ? parseInt(match[1]) + 1 : 5 * attempt;
        await sleep(waitSec * 1000);
      } else {
        console.error("❌ Digest send failed:", err.message);
        return false;
      }
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendLaunchCandidate({ trend, trendScore, launchScore, launchBrief, preparedLaunch }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatLaunchCandidateMessage({
    trend,
    trendScore,
    launchScore,
    launchBrief,
    preparedLaunch,
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bot.api.sendMessage(config.telegram.channelId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      console.log(`📤 Launch candidate sent: ${trend.name} (launch score: ${launchScore.total})`);
      return true;
    } catch (err) {
      if (err.message?.includes("429") || err.message?.includes("Too Many Requests")) {
        const match = err.message.match(/retry after (\d+)/);
        const waitSec = match ? parseInt(match[1]) + 1 : 5 * attempt;
        console.log(`   ⏳ Rate limited, waiting ${waitSec}s (attempt ${attempt}/3)...`);
        await sleep(waitSec * 1000);
      } else {
        console.error("❌ Failed to send launch candidate:", err.message);
        return false;
      }
    }
  }

  console.error("❌ Failed after 3 retries for launch candidate:", trend.name);
  return false;
}

function formatLaunchCandidateMessage({ trend, trendScore, launchScore, launchBrief, preparedLaunch }) {
  const reasons = launchScore.reasons?.length
    ? launchScore.reasons.slice(0, 3)
    : ["Attention velocity cleared OINK launch review.", "Market formation appears early.", "Trend is suitable for candidate preparation."];

  let msg = `🐷 <b>OINK LAUNCH CANDIDATE</b>\n\n`;
  msg += `Launch Score: <b>${launchScore.total}/100</b>\n`;
  msg += `Conviction: <b>${escapeHtml(launchScore.label)}</b>\n`;
  msg += `Trend Score: <b>${trendScore.total}/100</b>\n\n`;

  msg += `Source: <b>${escapeHtml(getSourceLabel(trend))}</b>\n`;
  msg += `Trend: <b>${escapeHtml(trend.name)}</b>\n`;
  msg += `Source Post: <a href="${escapeHtml(launchBrief.sourceUrl)}">link</a>\n\n`;

  msg += `<b>Why OINK Selected It:</b>\n`;
  for (const reason of reasons) {
    msg += `• ${escapeHtml(reason)}\n`;
  }

  msg += `\n<b>Suggested Market:</b>\n`;
  msg += `Name: ${escapeHtml(launchBrief.suggestedName)}\n`;
  msg += `Ticker: $${escapeHtml(launchBrief.suggestedTicker)}\n\n`;

  msg += `<b>Launch Thesis:</b>\n`;
  msg += `${escapeHtml(launchBrief.thesis)}\n\n`;

  if (launchBrief.existingToken) {
    const token = launchBrief.existingToken;
    msg += `<b>Existing Token:</b>\n`;
    msg += `${escapeHtml(token.tokenName || "Unknown")} on ${escapeHtml(token.chain || "unknown")}\n`;
    msg += `<code>`;
    msg += `MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `Liquidity: ${formatNumber(token.liquidity)}\n`;
    msg += `</code>\n`;
    if (token.url) msg += `<a href="${escapeHtml(token.url)}">Market link</a>\n`;
    msg += `\n`;
  }

  if (launchBrief.riskFlags?.length) {
    msg += `<b>Risk Flags:</b>\n`;
    for (const flag of launchBrief.riskFlags) {
      msg += `• ${escapeHtml(flag)}\n`;
    }
    msg += `\n`;
  }

  msg += `<b>Status:</b>\n`;
  msg += `${escapeHtml(preparedLaunch.note)}\n`;
  msg += `Prepared For Autonomous Launch Review\n\n`;

  msg += `<b>Flywheel:</b>\n`;
  msg += `Viral Attention → Autonomous Launch → Fees → $OINK Buybacks\n`;
  msg += `<i>${escapeHtml(getBuybackSummary())}</i>`;

  return msg;
}

function getSourceLabel(trend) {
  if (trend.sourcePlatform === "x") return "X";
  return "TikTok";
}
