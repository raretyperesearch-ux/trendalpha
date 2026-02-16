// ============================================================
// TELEGRAM ALERTS — v3
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
      "TikTok Viral Trends Bot\n\nTikTok trends → crypto signals.\n\nJoin the channel for alerts!",
      { parse_mode: "Markdown" }
    )
  );

  bot.command("status", (ctx) =>
    ctx.reply("Bot is running. Scanning every 15 minutes.")
  );

  return bot;
}

/**
 * Send alert with built-in retry for rate limits
 */
export async function sendAlert({ trend, score, token }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatAlertMessage({ trend, score, token });

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

  // Header — clean, no emoji
  msg += `<b>TIKTOK VIRAL TRENDS BOT</b>\n\n`;

  // Score
  msg += `SCORE: <b>${score.total}</b>/100\n`;
  msg += `<code>${bars}</code>\n\n`;

  // TikTok data
  msg += `<b>TIKTOK TREND</b>\n`;
  msg += `<b>${escapeHtml(trend.name)}</b>\n`;

  // Trend direction
  const arrow = trend.trendDirection === "rising" ? "Rising" :
                trend.trendDirection === "falling" ? "Falling" : "Stable";
  msg += `${arrow}`;
  if (trend.rank) msg += ` | Rank #${trend.rank}`;
  if (trend.rankChange && trend.rankChangeType === 1) msg += ` (↑${trend.rankChange})`;
  msg += `\n\n`;

  // Key metrics
  msg += `<code>`;
  msg += `Views/hour:   ${viewsPerHourStr}\n`;
  msg += `Total views:   ${formatCount(trend.totalViews)}\n`;
  msg += `Videos made:   ${formatCount(trend.videoCount)}\n`;
  msg += `</code>\n\n`;

  // Token data
  if (token) {
    msg += `<b>TOKEN FOUND</b>\n`;
    msg += `<b>${escapeHtml(token.tokenName)}</b> <code>${token.chain}</code>\n\n`;

    msg += `<code>`;
    msg += `MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `Liquidity: ${formatNumber(token.liquidity)}\n`;
    if (token.holders) msg += `Holders:   ${formatCount(token.holders)}\n`;
    msg += `24h:       ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h.toFixed(1)}%\n`;
    msg += `</code>\n\n`;

    // CA — tap to copy
    msg += `CA: <code>${token.tokenAddress}</code>\n\n`;

    // Trade links with ref
    const name = encodeURIComponent(token.tokenName);
    const ca = token.tokenAddress;

    msg += `<b>Trade (save 40% on fees):</b>\n`;
    msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
    msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
    msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
    msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>`;
    msg += ` | <a href="${token.url}">DS</a>\n`;
  } else {
    msg += `<b>NO TOKEN YET</b>\n\n`;
    msg += `No matching token found.\n`;
    msg += `Watch pump.fun for launches.\n\n`;
    msg += `<a href="https://pump.fun">pump.fun</a>\n`;
  }

  return msg;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
