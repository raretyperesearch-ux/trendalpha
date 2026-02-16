// ============================================================
// TELEGRAM ALERTS — v2 (with rate limiting)
// ============================================================

import { Bot } from "grammy";
import { config } from "./config.js";
import { getConviction } from "./scoring.js";
import { formatNumber, formatCount } from "./tokens.js";

let bot = null;

export function initBot() {
  bot = new Bot(config.telegram.botToken);

  bot.command("start", (ctx) =>
    ctx.reply(
      "📡 *TrendAlpha Bot*\n\nTikTok trends → crypto signals.\n\nJoin the channel for alerts!",
      { parse_mode: "Markdown" }
    )
  );

  bot.command("status", (ctx) =>
    ctx.reply("✅ Bot is running. Scanning every 15 minutes.")
  );

  return bot;
}

/**
 * Send alert with built-in retry for rate limits
 */
export async function sendAlert({ trend, score, token }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatAlertMessage({ trend, score, token });

  // Retry up to 3 times with backoff for rate limits
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await bot.api.sendMessage(config.telegram.channelId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      console.log(`📤 Alert sent: ${trend.name} (score: ${score.total})`);
      return true;
    } catch (err) {
      if (err.message?.includes("429") || err.message?.includes("Too Many Requests")) {
        // Extract retry_after or default to 5 seconds
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

function formatAlertMessage({ trend, score, token }) {
  const conviction = getConviction(score.total);
  const bars = "█".repeat(Math.round(score.total / 10)) +
               "░".repeat(10 - Math.round(score.total / 10));

  const viewsPerHourStr = formatCount(score.metrics.viewsPerHour);

  let msg = "";

  // Header
  msg += `${conviction.emoji} <b>TRENDALPHA SIGNAL</b>\n\n`;

  // Score
  msg += `SCORE: <b>${score.total}</b>/100\n`;
  msg += `<code>${bars}</code>\n\n`;

  // TikTok data
  msg += `📱 <b>TIKTOK TREND</b>\n`;
  msg += `<b>${escapeHtml(trend.name)}</b>\n`;

  // Trend direction arrow
  const arrow = trend.trendDirection === "rising" ? "📈 Rising" :
                trend.trendDirection === "falling" ? "📉 Falling" : "➡️ Stable";
  msg += `${arrow}`;
  if (trend.rank) msg += ` | Rank #${trend.rank}`;
  if (trend.rankChange && trend.rankChangeType === 1) msg += ` (↑${trend.rankChange})`;
  msg += `\n\n`;

  // Key metrics
  msg += `<code>`;
  msg += `⚡ Views/hour:   ${viewsPerHourStr}\n`;
  msg += `👁 Total views:   ${formatCount(trend.totalViews)}\n`;
  msg += `🎬 Videos made:   ${formatCount(trend.videoCount)}\n`;
  msg += `</code>\n`;

  // Score breakdown
  msg += `<i>Velocity: ${score.breakdown.velocity}/30 | Videos: ${score.breakdown.videoCount}/30 | Accel: ${score.breakdown.acceleration}/20 | Rank: ${score.breakdown.rank}/20</i>\n\n`;

  // Divider
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;

  // Token data
  if (token) {
    msg += `\n✅ <b>TOKEN FOUND</b>\n`;
    msg += `<b>${escapeHtml(token.tokenName)}</b> <code>${token.chain}</code>\n\n`;
    msg += `<code>CA: ${shortenAddress(token.tokenAddress)}</code>\n\n`;
    msg += `<code>`;
    msg += `MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `Liquidity: ${formatNumber(token.liquidity)}\n`;
    if (token.holders) msg += `Holders:   ${formatCount(token.holders)}\n`;
    msg += `24h:       ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h.toFixed(1)}%\n`;
    msg += `</code>\n`;
    msg += `\n📋 <b>CA:</b> <code>${token.tokenAddress}</code>\n\n`;
    msg += `🔗 <a href="${token.url}">DexScreener</a>\n`;
  } else {
    msg += `\n⚠️ <b>NO TOKEN YET</b>\n\n`;
    msg += `<i>No matching token found on DexScreener or Birdeye.\n`;
    msg += `High viral velocity — watch pump.fun for launches.</i>\n\n`;
    msg += `🔗 <a href="https://pump.fun">pump.fun</a>\n`;
  }

  // Context
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `💡 <b>CONTEXT</b>\n`;
  msg += `${generateContext({ trend, score, token })}\n`;

  // Footer
  msg += `\n<i>📡 TrendAlpha v1 • not financial advice • DYOR</i>`;

  return msg;
}

function generateContext({ trend, score, token }) {
  const parts = [];

  if (token) {
    if (token.liquidity < 20_000) parts.push("Low liquidity — careful with size.");
    else if (token.liquidity > 100_000) parts.push("Decent liquidity for entry.");
    if (token.priceChange24h > 200) parts.push("Already pumped hard — might be late.");
    else if (token.priceChange24h > 50) parts.push("Running but trend still growing.");
    if (token.holders && token.holders < 500) parts.push("Low holder count — early or dead.");
  } else {
    parts.push("NO TOKEN YET.");
    if (score.total >= 85) parts.push("Viral velocity is high — expect a token launch on pump.fun soon.");
    else parts.push("Monitor pump.fun for potential launches.");
  }

  if (score.breakdown.acceleration >= 16) parts.push("Trend is accelerating fast.");
  else if (score.breakdown.acceleration <= 4) parts.push("Trend is slowing down.");

  if (trend.videoCount > 10_000) parts.push(`${formatCount(trend.videoCount)} creators is very strong adoption.`);
  else if (trend.videoCount > 5_000) parts.push(`${formatCount(trend.videoCount)} creators — solid adoption.`);

  return parts.join(" ");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr || "???";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
