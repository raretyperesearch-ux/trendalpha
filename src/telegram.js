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
const TELEGRAM_CALLBACK_DATA_MAX_BYTES = 64;
const TELEGRAM_MESSAGE_MAX_CHARS = 4096;

let bot = null;
const alertMetrics = {
  attemptedAlerts: 0,
  successfulAlerts: 0,
  failedAlerts: 0,
  retryRecoveries: 0,
  fallbackRecoveries: 0,
};

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
      const token = await findToken(freshTrend);

      // Build updated message
      const message = formatAlertMessage({ trend: freshTrend, score, token });

      // Edit the original message in place
      const keyboard = buildSafeInlineKeyboard({
        type: "refresh",
        refreshId: hashtagName,
      });
      await ctx.editMessageText(message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
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
  return buildSafeInlineKeyboard({
    type: "refresh",
    refreshId: hashtagName,
  });
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
  const compact = formatAlertMessage({ trend, score, token, isNewEntry, mode: "compact" });
  const sent = await sendTelegramWithFallback({
    label: `alert:${trend.id || trend.name}`,
    richHtml: message,
    compactHtml: compact,
    minimalText: buildMinimalAlertText({ title: "OINK ALERT", name: trend.name, score: score.total, sourceUrl: trend.sourceUrl }),
    keyboardAlert: trend.sourcePlatform === "x" ? null : { type: "refresh", refreshId: trend.name.replace("#", "") },
  });
  if (sent) console.log(`📤 Alert sent: ${trend.name} (score: ${score.total})`);
  return sent;
}

function formatAlertMessage({ trend, score, token, isNewEntry = false, mode = "rich" }) {
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
  msg += `${trend.sourcePlatform === "x" ? "🐷" : conviction.emoji} <b>${trend.sourcePlatform === "x" ? "OINK X ATTENTION SIGNAL" : "OINK ATTENTION ALERT"}</b>\n\n`;
  if (trend.sourcePlatform === "x" && trend.launchWorthinessScore !== undefined) {
    msg = msg.replace("OINK X ATTENTION SIGNAL", "OINK MARKET PHASE");
  }

  // Score
  msg += `🎯 SCORE: <b>${score.total}</b>/100\n`;
  if (mode === "rich") msg += `<code>${bars}</code>\n\n`;
  else msg += `\n`;

  // Source data
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  if (trend.sourcePlatform === "x") {
    msg += `𝕏 <b>VIRAL X POST</b>\n`;
    msg += `Source: <b>X</b>\n`;
    msg += `Source Tweet: <a href="${escapeHtml(safeTelegramUrl(trend.sourceUrl, "https://x.com"))}">link</a>\n`;
    if (trend.author) msg += `by @${escapeHtml(trend.author)}\n`;
    msg += `Viral Shape: <b>${escapeHtml(formatLabel(trend.viralShape || "compounding"))}</b>\n`;
    msg += `Momentum: <b>${escapeHtml(formatLabel(trend.momentumTrend || "stable"))}</b>\n`;
    msg += `Discovery Lane: <b>${escapeHtml(trend.discoveryLane || "broad_media_stream")}</b>\n`;
    if (trend.launchWorthinessScore !== undefined) {
      msg += `<b>Market Phase:</b>\n`;
      msg += `Narrative Phase: <b>${escapeHtml(formatLabel(trend.narrativePhase || "forming"))}</b>\n`;
      msg += `Momentum: <b>${escapeHtml(trend.momentumState || formatLabel(trend.momentumTrend || "stable"))}</b>\n`;
      msg += `Cross-Community Spread: <b>${escapeHtml(trend.crossCommunityTrend || "LOW")}</b>\n`;
      msg += `Swarm Pressure: <b>${escapeHtml(labelPressure(trend.swarmPressure))}</b>\n`;
      msg += `Saturation Pressure: <b>${Number(trend.saturationPressure || 0)}/100</b>\n`;
      msg += `Launch Readiness: <b>${Number(trend.launchReadiness || trend.launchWorthinessScore || 0)}/100</b>\n`;
      msg += `Launch Window: <b>${escapeHtml(trend.launchWindow || "WATCH")}</b>\n`;
      msg += `Ideal Timing: <b>${escapeHtml(formatLabel(trend.idealLaunchTiming || "watch"))}</b>\n`;
      msg += `Launch Worthiness: <b>${trend.launchWorthinessScore}/100</b>\n`;
      msg += `Archetype: <b>${escapeHtml(formatLabel(trend.marketArchetype || "trendwave"))}</b>\n`;
      msg += `Narrative Half-Life: <b>${escapeHtml(formatLabel(trend.narrativeHalfLifeEstimate || "flash trend"))}</b>\n`;
      if (mode === "rich") {
        msg += `Community Formation: <b>${escapeHtml(trend.communityFormationLabel || "LOW")}</b>\n`;
        msg += `Remixability: <b>${escapeHtml(trend.remixabilityLabel || "LOW")}</b>\n`;
      }
      msg += `Recommendation: <b>${escapeHtml(trend.launchRecommendation || "WATCH")}</b>\n`;
    }
    if (trend.quoteExplosion) msg += `Quote Explosion Detected ⚡\n`;
    msg += `<b>${escapeHtml(trend.name)}</b>\n`;
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
    msg += formatXMetricsCodeBlock(trend, { includeReposts: true, includeShape: true, raw: true, compact: mode !== "rich" });
  } else {
    msg += `⚡ Views/hour:   ${viewsPerHourStr}\n`;
    msg += `👁 Total views:   ${formatCount(trend.totalViews)}\n`;
    msg += `🎬 Videos made:   ${formatCount(trend.videoCount)}\n`;
  }
  msg += `</code>\n`;
  if (trend.memeticArtifact) {
    msg += formatArtifactInline(trend.memeticArtifact);
  }
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Token data
  if (token?.matchStatus === "canonical") {
    msg += `✅ <b>CANONICAL MARKET FOUND</b>\n`;
    msg += `<b>${escapeHtml(token.tokenName)}</b> <code>${escapeHtml(token.tokenSymbol || "")}</code> <code>${token.chain}</code>\n`;
    msg += `Confidence: ${(Number(token.matchConfidence || 0) * 100).toFixed(0)}%\n\n`;

    msg += `<code>`;
    msg += `💰 MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `📊 24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `💧 Liquidity: ${formatNumber(token.liquidity)}\n`;
    if (token.holders) msg += `👥 Holders:   ${formatCount(token.holders)}\n`;
    msg += `📈 24h:       ${token.priceChange24h > 0 ? "+" : ""}${token.priceChange24h.toFixed(1)}%\n`;
    msg += `</code>\n\n`;

    // CA — tap to copy
    if (mode === "rich") msg += `📋 CA: <code>${token.tokenAddress}</code>\n\n`;

    // Trade links with ref
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔗 <b>Trade (save 40% on fees):</b>\n`;
    msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
    msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
    msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
    msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>`;
    msg += ` | <a href="${escapeHtml(safeTelegramUrl(token.url, "https://dexscreener.com"))}">DS</a>\n`;
  } else if (token?.matchStatus === "possible") {
    msg += `⚠️ <b>POSSIBLE MARKET DETECTED</b>\n`;
    msg += `<b>${escapeHtml(token.tokenName)}</b> <code>${escapeHtml(token.tokenSymbol || "")}</code> on ${escapeHtml(token.chain || "unknown")}\n`;
    msg += `Confidence: ${(Number(token.matchConfidence || 0) * 100).toFixed(0)}%\n`;
    msg += `Contract withheld until canonical match confidence clears OINK threshold.\n\n`;
    msg += `<code>`;
    msg += `MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `Liquidity: ${formatNumber(token.liquidity)}\n`;
    msg += `</code>\n\n`;
    msg += `OINK is treating this as unconfirmed and still watching launch potential.\n\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔗 <b>Trade (save 40% on fees):</b>\n`;
    msg += `<a href="https://axiom.trade/@viraltok">Axiom</a>`;
    msg += ` | <a href="https://trade.padre.gg/rk/raretype">Padre</a>`;
    msg += ` | <a href="https://trojan.com/@Rare">Trojan</a>`;
    msg += ` | <a href="https://gmgn.ai/r/viraltok">GMGN</a>`;
    msg += ` | <a href="https://pump.fun">pump.fun</a>\n`;
  } else {
    msg += `❌ <b>NO TOKEN FOUND</b>\n\n`;
    msg += `No canonical market found.\n`;
    msg += `OINK is watching this as attention before a market exists.\n\n`;
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

  return constrainTelegramMessage(msg);
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
      msg += `${i + 1}. <a href="${escapeHtml(safeTelegramUrl(trend.sourceUrl, "https://x.com"))}">${escapeHtml(trend.name)}</a>`;
    } else if (trend.type === "song") {
      msg += `${i + 1}. 🎵 ${escapeHtml(trend.name)}`;
    } else {
      const cleanName = trend.name.replace("#", "");
      msg += `${i + 1}. <a href="https://www.tiktok.com/tag/${encodeURIComponent(cleanName)}">${escapeHtml(trend.name)}</a>`;
    }
    msg += ` — <b>${score.total}</b>/100 ${arrow}\n`;
    if (trend.sourcePlatform === "x") {
      msg += `   ${formatCount(score.metrics.viewsPerHour)} v/hr | ${formatCount(trend.shareVelocity)} shares/hr | ${formatCount(trend.quoteVelocity)} q/hr | ${escapeHtml(formatLabel(trend.viralShape || "compounding"))}`;
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

  const sent = await sendTelegramWithFallback({
    label: "digest",
    richHtml: msg,
    compactHtml: constrainTelegramMessage(msg),
    minimalText: buildMinimalAlertText({ title: "OINK TRENDING DIGEST", name: `${top.length} trends`, score: null }),
  });
  if (sent) console.log(`📊 Digest sent — ${top.length} trends`);
  return sent;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramWithFallback({ label, richHtml, compactHtml, minimalText, keyboardAlert = null, api = bot?.api }) {
  if (!api) throw new Error("Bot API unavailable");

  alertMetrics.attemptedAlerts++;
  const keyboard = buildSafeInlineKeyboard(keyboardAlert);
  const attempts = [
    {
      mode: "rich",
      text: constrainTelegramMessage(richHtml),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      },
    },
    {
      mode: "rich_no_buttons",
      text: constrainTelegramMessage(richHtml),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
    },
    {
      mode: "compact",
      text: constrainTelegramMessage(compactHtml || richHtml),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
    },
    {
      mode: "minimal",
      text: constrainTelegramMessage(minimalText || htmlToPlainText(compactHtml || richHtml), { maxChars: 3500 }),
      options: {
        disable_web_page_preview: true,
      },
    },
  ];

  const enabledAttempts = config.telegram.safeMode
    ? attempts.filter((attempt) => attempt.mode === "compact" || attempt.mode === "minimal")
    : attempts;
  if (config.telegram.safeMode) {
    console.log(`   🧰 Telegram safe mode enabled for ${label}; starting at compact mode`);
  }

  let previousError = null;
  for (const attempt of enabledAttempts) {
    for (let rateAttempt = 1; rateAttempt <= 3; rateAttempt++) {
      try {
        logTelegramPayload({ label, mode: attempt.mode, keyboard: attempt.options.reply_markup ? keyboard : null });
        await api.sendMessage(config.telegram.channelId, attempt.text, attempt.options);
        alertMetrics.successfulAlerts++;
        if (previousError) {
          if (attempt.mode === "rich_no_buttons") alertMetrics.retryRecoveries++;
          else alertMetrics.fallbackRecoveries++;
          console.log(`   ✅ Telegram fallback recovered ${label} using ${attempt.mode}`);
        }
        return true;
      } catch (err) {
        previousError = err;
        if (isRateLimitError(err)) {
          const waitSec = getRetryAfterSeconds(err, rateAttempt);
          console.log(`   ⏳ Telegram rate limited for ${label}, waiting ${waitSec}s (attempt ${rateAttempt}/3)...`);
          await sleep(waitSec * 1000);
          continue;
        }
        console.error(`   ⚠️  Telegram ${attempt.mode} failed for ${label}: ${err.message}`);
        if (isButtonDataInvalid(err) && attempt.mode === "rich") {
          console.log(`   🧯 BUTTON_DATA_INVALID for ${label}; retrying without buttons`);
          break;
        }
        if (isTelegramBadRequest(err)) {
          console.log(`   🧯 Telegram rejected ${attempt.mode}; downgrading alert mode`);
          break;
        }
        break;
      }
    }
  }

  alertMetrics.failedAlerts++;
  console.error(`❌ Telegram alert failed after all fallbacks: ${label}`);
  return false;
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
  const compact = formatLaunchCandidateMessage({
    trend,
    trendScore,
    launchScore,
    launchBrief,
    preparedLaunch,
    mode: "compact",
  });
  const sent = await sendTelegramWithFallback({
    label: `launch:${trend.id || trend.name}`,
    richHtml: message,
    compactHtml: compact,
    minimalText: buildMinimalAlertText({ title: "OINK LAUNCH CANDIDATE", name: trend.name, score: launchScore.total, sourceUrl: launchBrief.sourceUrl }),
  });
  if (sent) console.log(`📤 Launch candidate sent: ${trend.name} (launch score: ${launchScore.total})`);
  return sent;
}

export async function sendNarrativeClusterAlert(cluster) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatNarrativeClusterAlert(cluster);
  const compact = formatNarrativeClusterAlert(cluster, { mode: "compact" });
  const sent = await sendTelegramWithFallback({
    label: `cluster:${cluster.clusterId || cluster.canonicalEntity}`,
    richHtml: message,
    compactHtml: compact,
    minimalText: buildMinimalAlertText({ title: "OINK NARRATIVE CLUSTER", name: cluster.canonicalEntity, score: cluster.launchWorthinessScore }),
  });
  if (sent) console.log(`📤 Narrative cluster sent: ${cluster.canonicalEntity} (${cluster.launchWorthinessScore})`);
  return sent;
}

export async function sendDryRunLaunchAlert(shadowLaunch) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatDryRunLaunchAlert(shadowLaunch);
  const sent = await sendTelegramWithFallback({
    label: `shadow:${shadowLaunch.launchId || shadowLaunch.ticker}`,
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({
      title: "OINK PREPARE LAUNCH",
      name: `${shadowLaunch.title} ($${shadowLaunch.ticker})`,
      score: shadowLaunch.launchReadiness,
    }),
  });
  if (sent) console.log(`📤 Dry-run launch alert sent: ${shadowLaunch.title} ($${shadowLaunch.ticker})`);
  return sent;
}

export async function sendArtifactPreview({ trend, artifact = trend?.memeticArtifact }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");
  if (!artifact) return false;

  const message = formatArtifactPreview({ trend, artifact });
  const sent = await sendTelegramWithFallback({
    label: `artifact:${trend?.id || artifact.extractedPhrase || artifact.suggestedTicker}`,
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({
      title: "OINK ARTIFACT DETECTED",
      name: artifact.tokenIdentity || artifact.extractedPhrase || trend?.name,
      score: artifact.artifactStrength,
      sourceUrl: trend?.sourceUrl,
    }),
  });
  if (sent) console.log(`📤 Artifact preview sent: ${trend?.name || artifact.extractedPhrase}`);
  return sent;
}

export function formatArtifactPreview({ trend = {}, artifact }) {
  let msg = `🐷 <b>OINK ARTIFACT DETECTED</b>\n\n`;
  msg += `Platform:\n<b>${escapeHtml(getSourceLabel(trend))}</b>\n\n`;
  msg += `Artifact Type:\n<b>${escapeHtml(formatLabel(artifact.artifactType))}</b>\n\n`;
  msg += `Source:\n${escapeHtml(getArtifactSourceSummary(trend, artifact))}\n\n`;
  msg += `Recognizability:\n<b>${escapeHtml(labelArtifactScore(artifact.scores?.recognizability))}</b>\n\n`;
  msg += `Remixability:\n<b>${escapeHtml(labelArtifactScore(artifact.scores?.remixability))}</b>\n\n`;
  msg += `Recommended Action:\n<b>${escapeHtml(artifact.recommendedAction || "IDENTITY_COMPRESSION")}</b>\n\n`;
  msg += `Suggested Ticker:\n<b>$${escapeHtml(artifact.suggestedTicker || "OINK")}</b>\n\n`;
  msg += `<code>`;
  msg += `Strength:    ${Number(artifact.artifactStrength || 0)}/100\n`;
  msg += `Visual Plan: ${artifact.visualReuseMode || "generate_new_image"}\n`;
  msg += `Phrase:      ${artifact.extractedPhrase || "n/a"}\n`;
  msg += `Emotion:     ${artifact.emotionalTexture || "curious"}`;
  msg += `</code>\n\n`;
  msg += `${escapeHtml(artifact.identityCompressionSummary || "")}`;
  return constrainTelegramMessage(msg);
}

export function formatDryRunLaunchAlert(shadowLaunch) {
  const payload = shadowLaunch.payload || {};
  const narrative = payload.narrative || {};
  const timing = payload.launchTiming || {};

  let msg = `🐷 <b>OINK PREPARE LAUNCH</b>\n\n`;
  msg += `Narrative:\n<b>${escapeHtml(narrative.clusterName || shadowLaunch.title)}</b>\n\n`;
  msg += `Ticker:\n<b>$${escapeHtml(shadowLaunch.ticker)}</b>\n\n`;
  msg += `Narrative Phase:\n<b>${escapeHtml(formatLabel(shadowLaunch.narrativePhase || narrative.phase || "forming"))}</b>\n\n`;
  msg += `Launch Readiness:\n<b>${Number(shadowLaunch.launchReadiness || 0)}/100</b>\n\n`;
  msg += `Swarm Pressure:\n<b>${escapeHtml(labelPressure(shadowLaunch.swarmPressure))}</b>\n\n`;
  msg += `Launch Window:\n<b>${escapeHtml(timing.idealLaunchWindow || "WATCH")}</b>\n\n`;
  if (payload.sourceArtifactType) {
    msg += `<b>Source Artifact:</b>\n`;
    msg += `${escapeHtml(formatLabel(payload.sourceArtifactType))} | strength ${Number(payload.artifactStrength || 0)}/100\n`;
    msg += `Visual Plan: <b>${escapeHtml(formatLabel(payload.visualReuseMode || "generate_new_image"))}</b>\n`;
    if (payload.extractedPhrase) msg += `Phrase: ${escapeHtml(payload.extractedPhrase)}\n`;
    if (payload.emotionalTexture) msg += `Emotion: ${escapeHtml(payload.emotionalTexture)}\n`;
    msg += `\n`;
  }
  msg += `Deployment:\n<b>DRY RUN</b>\n\n`;
  msg += `<b>Reasoning:</b>\n`;
  for (const reason of (shadowLaunch.launchReasoning || []).slice(0, 4)) {
    msg += `• ${escapeHtml(reason)}\n`;
  }
  msg += `\n<i>No transaction submitted. No wallet used.</i>`;
  return constrainTelegramMessage(msg);
}

export function formatNarrativeClusterAlert(cluster, { mode = "rich" } = {}) {
  const topPosts = (cluster.relatedPosts || [])
    .slice()
    .sort((a, b) => Number(b.attentionMomentum || 0) - Number(a.attentionMomentum || 0))
    .slice(0, 2);

  let msg = `🐷 <b>OINK NARRATIVE CLUSTER</b>\n\n`;
  msg += `Entity: <b>${escapeHtml(cluster.canonicalEntity)}</b>\n`;
  msg += `State: <b>${escapeHtml(formatLabel(cluster.lifecycleState))}</b>\n`;
  msg += `Momentum: <b>${escapeHtml(formatLabel(cluster.momentumTrend))}</b>\n`;
  msg += `Launch Readiness: <b>${cluster.launchReadiness || cluster.launchWorthinessScore}/100</b>\n`;
  msg += `Launch Window: <b>${escapeHtml(cluster.launchWindow || "WATCH")}</b>\n`;
  msg += `Ideal Timing: <b>${escapeHtml(formatLabel(cluster.idealLaunchTiming || "watch"))}</b>\n`;
  msg += `Saturation Pressure: <b>${cluster.saturationPressure || 0}/100</b>\n`;
  msg += `Swarm Pressure: <b>${escapeHtml(labelPressure(cluster.swarmPressure))}</b>\n`;
  msg += `Archetype: <b>${escapeHtml(formatLabel(cluster.archetype))}</b>\n`;
  msg += `Cross-Community Spread: <b>${escapeHtml(cluster.crossCommunityTrend || labelSpread(cluster.communitySpreadScore))}</b>\n\n`;

  msg += `<code>`;
  msg += `Posts Tracked: ${formatCount(cluster.relatedPosts?.length || 0)}\n`;
  msg += `Accounts:      ${formatCount(cluster.relatedAccounts?.length || 0)}\n`;
  msg += `Remix Count:   ${formatCount(cluster.remixCount)}\n`;
  msg += `Momentum:      ${formatCount(cluster.totalMomentum)}\n`;
  msg += `Persistence:   ${cluster.propagationPersistence}/100\n`;
  msg += `Quote Expand:  ${cluster.quoteChainExpansion || 0}/100\n`;
  msg += `Remix Growth:  ${cluster.remixGrowthRate || 0}/100\n`;
  msg += `Worthiness:    ${cluster.launchWorthinessScore}/100`;
  msg += `</code>\n\n`;

  msg += `Recommendation:\n<b>${escapeHtml(cluster.recommendation)}</b>\n\n`;
  if (cluster.memeticArtifact) {
    msg += `<b>Memetic Artifact:</b>\n`;
    msg += `${escapeHtml(formatLabel(cluster.sourceArtifactType || cluster.memeticArtifact.artifactType))} | strength ${Number(cluster.artifactStrength || cluster.memeticArtifact.artifactStrength || 0)}/100\n`;
    msg += `Visual Plan: ${escapeHtml(formatLabel(cluster.visualReuseMode || cluster.memeticArtifact.visualReuseMode || "generate_new_image"))}\n`;
    if (cluster.extractedPhrase || cluster.memeticArtifact.extractedPhrase) {
      msg += `Phrase: ${escapeHtml(cluster.extractedPhrase || cluster.memeticArtifact.extractedPhrase)}\n`;
    }
    msg += `Ticker Bias: $${escapeHtml(cluster.artifactSuggestedTicker || cluster.memeticArtifact.suggestedTicker || "OINK")}\n\n`;
  }
  if (cluster.quoteExplosion) msg += `Quote Explosion Detected ⚡\n`;
  if (cluster.copycatSwarm) msg += `Copycat Swarm Pollution Detected\n`;
  if (cluster.viralShapeReason) msg += `${escapeHtml(cluster.viralShapeReason)}\n`;

  if (mode === "rich" && topPosts.length > 0) {
    msg += `\n<b>Top Sources:</b>\n`;
    for (const post of topPosts) {
      const url = safeTelegramUrl(post.sourceUrl, "https://x.com");
      msg += `• <a href="${escapeHtml(url)}">${escapeHtml(post.name || post.id)}</a>`;
      if (post.author) msg += ` by @${escapeHtml(post.author)}`;
      msg += `\n`;
    }
  }

  return constrainTelegramMessage(msg);
}

export function formatNarrativeMemoryDebug({ cluster, analytics = {} }) {
  let msg = `🧠 <b>OINK NARRATIVE MEMORY</b>\n\n`;
  msg += `Cluster:\n<b>${escapeHtml(cluster.canonicalEntity || cluster.clusterId || "Unknown")}</b>\n\n`;
  msg += `Age:\n${escapeHtml(String(analytics.ageHours ?? 0))}h\n\n`;
  msg += `Phase:\n<b>${escapeHtml(formatLabel(cluster.lifecycleState || "emerging"))}</b>\n\n`;
  msg += `Persistence:\n<b>${Number(cluster.propagationPersistence || analytics.persistenceScore || 0)}/100</b>\n\n`;
  msg += `Re-emergence Risk:\n<b>${escapeHtml(analytics.reEmergenceRisk || "LOW")}</b>\n\n`;
  msg += `Swarm Pressure:\n<b>${escapeHtml(labelPressure(cluster.swarmPressure))}</b>\n\n`;
  msg += `Momentum Stability:\n<b>${escapeHtml(analytics.momentumStabilityLabel || "LOW")}</b>`;
  return constrainTelegramMessage(msg);
}

function formatLaunchCandidateMessage({ trend, trendScore, launchScore, launchBrief, preparedLaunch, mode = "rich" }) {
  const reasons = launchScore.reasons?.length
    ? launchScore.reasons.slice(0, 3)
    : ["Attention velocity cleared OINK launch review.", "Market formation appears early.", "Trend is suitable for candidate preparation."];

  const isX = trend.sourcePlatform === "x";
  let msg = `🐷 <b>${isX ? "OINK X LAUNCH CANDIDATE" : "OINK LAUNCH CANDIDATE"}</b>\n\n`;
  msg += `Launch Score: <b>${launchScore.total}/100</b>\n`;
  msg += `Conviction: <b>${escapeHtml(launchScore.label)}</b>\n`;
  msg += `Trend Score: <b>${trendScore.total}/100</b>\n\n`;

  msg += `Source: <b>${escapeHtml(getSourceLabel(trend))}</b>\n`;
  if (isX && trend.author) msg += `Author: @${escapeHtml(trend.author)}\n`;
  msg += `Trend: <b>${escapeHtml(trend.name)}</b>\n`;
  msg += `${isX ? "Source Tweet" : "Source Post"}: <a href="${escapeHtml(safeTelegramUrl(launchBrief.sourceUrl, isX ? "https://x.com" : "https://www.tiktok.com"))}">link</a>\n\n`;

  if (isX) {
    if (trend.launchWorthinessScore !== undefined) {
      msg += `<b>Market Formation:</b>\n`;
      msg += `Narrative Phase: <b>${escapeHtml(formatLabel(trend.narrativePhase || "forming"))}</b>\n`;
      msg += `Momentum: <b>${escapeHtml(trend.momentumState || formatLabel(trend.momentumTrend || "stable"))}</b>\n`;
      msg += `Cross-Community Spread: <b>${escapeHtml(trend.crossCommunityTrend || "LOW")}</b>\n`;
      msg += `Swarm Pressure: <b>${escapeHtml(labelPressure(trend.swarmPressure))}</b>\n`;
      msg += `Launch Readiness: <b>${Number(trend.launchReadiness || trend.launchWorthinessScore || 0)}/100</b>\n`;
      msg += `Launch Window: <b>${escapeHtml(trend.launchWindow || "WATCH")}</b>\n`;
      msg += `Ideal Timing: <b>${escapeHtml(formatLabel(trend.idealLaunchTiming || "watch"))}</b>\n`;
      msg += `Launch Worthiness: <b>${trend.launchWorthinessScore}/100</b>\n`;
      msg += `Archetype: <b>${escapeHtml(formatLabel(trend.marketArchetype || "trendwave"))}</b>\n`;
      msg += `Narrative Half-Life: <b>${escapeHtml(formatLabel(trend.narrativeHalfLifeEstimate || "flash trend"))}</b>\n`;
      if (mode === "rich") {
        msg += `Community Formation: <b>${escapeHtml(trend.communityFormationLabel || "LOW")}</b>\n`;
        msg += `Remixability: <b>${escapeHtml(trend.remixabilityLabel || "LOW")}</b>\n`;
      }
      msg += `Recommendation: <b>${escapeHtml(trend.launchRecommendation || "WATCH")}</b>\n\n`;
    }
    msg += `Viral Shape: <b>${escapeHtml(formatLabel(trend.viralShape || "compounding"))}</b>\n`;
    msg += `Momentum: <b>${escapeHtml(formatLabel(trend.momentumTrend || "stable"))}</b>\n`;
    msg += `Discovery Lane: <b>${escapeHtml(trend.discoveryLane || "broad_media_stream")}</b>\n`;
    if (trend.quoteExplosion) msg += `Quote Explosion Detected ⚡\n`;
    msg += `\n`;
    msg += `<b>X Virality:</b>\n`;
    msg += formatXMetricsCodeBlock(trend, { includeMedia: true, includeReposts: true, includeShape: true });
    msg += `\n<b>X Narrative Tag:</b>\n`;
    msg += `${escapeHtml(launchBrief.socialTag || "#OINKLaunch")}\n\n`;
  }

  if (trend.memeticArtifact) {
    msg += `<b>Memetic Artifact:</b>\n`;
    msg += `${escapeHtml(formatLabel(trend.memeticArtifact.artifactType))} | ${Number(trend.memeticArtifact.artifactStrength || 0)}/100\n`;
    msg += `Visual Plan: ${escapeHtml(formatLabel(trend.memeticArtifact.visualReuseMode || "generate_new_image"))}\n`;
    if (trend.memeticArtifact.extractedPhrase) msg += `Phrase: ${escapeHtml(trend.memeticArtifact.extractedPhrase)}\n`;
    msg += `Ticker Bias: $${escapeHtml(trend.memeticArtifact.suggestedTicker || launchBrief.suggestedTicker)}\n\n`;
  }

  msg += `<b>Why OINK Selected It:</b>\n`;
  for (const reason of reasons) {
    msg += `• ${escapeHtml(reason)}\n`;
  }

  msg += `\n<b>Suggested Market:</b>\n`;
  msg += `Name: ${escapeHtml(launchBrief.suggestedName)}\n`;
  msg += `Ticker: $${escapeHtml(launchBrief.suggestedTicker)}\n\n`;

  msg += `<b>Launch Thesis:</b>\n`;
  msg += `${escapeHtml(launchBrief.thesis)}\n\n`;

  if (isX) {
    msg += `<b>Bring It Back To The Source:</b>\n`;
    msg += `${escapeHtml(launchBrief.sourceBacklinkText || "")}\n\n`;
    if (mode === "rich" && launchBrief.xLaunchPost) {
      msg += `<b>Suggested X Post:</b>\n`;
      msg += `<code>${escapeHtml(launchBrief.xLaunchPost)}</code>\n\n`;
    }
  }

  if (launchBrief.existingToken) {
    const token = launchBrief.existingToken;
    msg += `<b>Canonical Market Found:</b>\n`;
    msg += `${escapeHtml(token.tokenName || "Unknown")} on ${escapeHtml(token.chain || "unknown")}\n`;
    msg += `Confidence: ${(Number(token.matchConfidence || 0) * 100).toFixed(0)}%\n`;
    msg += `<code>`;
    msg += `MCap:      ${formatNumber(token.marketCap)}\n`;
    msg += `24h Vol:   ${formatNumber(token.volume24h)}\n`;
    msg += `Liquidity: ${formatNumber(token.liquidity)}\n`;
    msg += `</code>\n`;
    if (token.url) msg += `<a href="${escapeHtml(safeTelegramUrl(token.url, "https://dexscreener.com"))}">Market link</a>\n`;
    msg += `\n`;
  } else if (launchBrief.possibleMarket) {
    const token = launchBrief.possibleMarket;
    msg += `<b>Possible Market Detected:</b>\n`;
    msg += `${escapeHtml(token.tokenName || "Unknown")} on ${escapeHtml(token.chain || "unknown")}\n`;
    msg += `Confidence: ${(Number(token.matchConfidence || 0) * 100).toFixed(0)}%\n`;
    msg += `Contract withheld until canonical confidence clears OINK threshold.\n\n`;
  } else if (isX) {
    msg += `<b>Market Status:</b>\n`;
    msg += `No canonical market found. Launch opportunity remains open.\n\n`;
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

  return constrainTelegramMessage(msg);
}

function getSourceLabel(trend) {
  if (trend.sourcePlatform === "x") return "X";
  return "TikTok";
}

function formatArtifactInline(artifact) {
  let msg = `<b>Memetic Artifact:</b>\n`;
  msg += `${escapeHtml(formatLabel(artifact.artifactType))} | strength ${Number(artifact.artifactStrength || 0)}/100\n`;
  msg += `Visual Plan: <b>${escapeHtml(formatLabel(artifact.visualReuseMode || "generate_new_image"))}</b>\n`;
  if (artifact.extractedPhrase) msg += `Phrase: ${escapeHtml(artifact.extractedPhrase)}\n`;
  if (artifact.emotionalTexture) msg += `Emotion: ${escapeHtml(artifact.emotionalTexture)}\n`;
  msg += `Ticker Bias: <b>$${escapeHtml(artifact.suggestedTicker || "OINK")}</b>\n`;
  return `${msg}\n`;
}

function getArtifactSourceSummary(trend, artifact) {
  if (trend.sourcePlatform === "tiktok" && artifact.artifactType === "audio_artifact") return "viral TikTok sound";
  if (trend.sourcePlatform === "tiktok") return "TikTok caption/reaction format";
  if (trend.sourcePlatform === "x" && trend.hasMedia) return "viral X media post";
  if (trend.sourcePlatform === "x") return "viral X discourse fragment";
  return "stored narrative artifact";
}

function labelArtifactScore(score) {
  const value = Number(score || 0);
  if (value >= 80) return "VERY HIGH";
  if (value >= 65) return "HIGH";
  if (value >= 45) return "MEDIUM";
  return "LOW";
}

export async function sendLaunchCreatedAlert({ trend, launchBrief, launchedToken, feeSummary = null }) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatLaunchCreatedAlert({ trend, launchBrief, launchedToken, feeSummary });
  const sent = await sendTelegramWithFallback({
    label: `created:${launchedToken.ticker || launchedToken.name}`,
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({ title: "OINK MARKET CREATED", name: launchedToken.name, score: null, sourceUrl: launchedToken.launchUrl }),
  });
  if (sent) console.log(`📤 Launch-created alert sent: ${launchedToken.name} (${launchedToken.ticker})`);
  return sent;
}

export function formatLaunchCreatedAlert({ trend, launchBrief, launchedToken, feeSummary = null }) {
  const ticker = launchedToken.ticker?.startsWith("$")
    ? launchedToken.ticker
    : `$${launchedToken.ticker}`;

  let msg = `🐷 <b>OINK MARKET CREATED</b>\n\n`;
  msg += `Source: <b>${escapeHtml(getSourceLabel(trend))}</b>\n`;
  if (trend.sourcePlatform === "x") {
    msg += `Original Viral Tweet: <a href="${escapeHtml(safeTelegramUrl(launchBrief.sourceUrl, "https://x.com"))}">link</a>\n\n`;
    msg += `<b>X Narrative Tag:</b>\n`;
    msg += `${escapeHtml(launchBrief.socialTag || "#OINKLaunch")}\n\n`;
  } else {
    msg += `Original Source: <a href="${escapeHtml(safeTelegramUrl(launchBrief.sourceUrl, "https://www.tiktok.com"))}">link</a>\n\n`;
  }

  msg += `<b>Market:</b>\n`;
  msg += `${escapeHtml(launchedToken.name)} (${escapeHtml(ticker)})\n\n`;
  msg += `<b>Contract:</b>\n`;
  msg += `<code>${escapeHtml(launchedToken.contractAddress || "pending")}</code>\n\n`;
  msg += `<b>Launch:</b>\n`;
  if (launchedToken.launchUrl) {
    msg += `<a href="${escapeHtml(safeTelegramUrl(launchedToken.launchUrl, "https://pump.fun"))}">${escapeHtml(launchedToken.platform || "launch link")}</a>\n\n`;
  } else {
    msg += `${escapeHtml(launchedToken.platform || "pending")}\n\n`;
  }
  msg += `<b>Flywheel:</b>\n`;
  msg += `Launch Fees → $OINK Buybacks\n`;
  if (feeSummary) msg += `${escapeHtml(feeSummary)}\n`;
  msg += `\nThis market was created from viral internet attention detected by OINK.`;

  return constrainTelegramMessage(msg);
}

function formatXMetricsCodeBlock(trend, options = {}) {
  const {
    includeMedia = false,
    includeReposts = false,
    includeReplies = false,
    includeShape = false,
    raw = false,
    compact = false,
  } = options;
  const lines = compact ? [
    `Views/hr: ${formatCount(trend.viewsPerHour)}`,
    `Shares/hr: ${formatCount(trend.shareVelocity)}`,
    `Quotes: ${formatCount(trend.quoteCount)}`,
    `Shape: ${formatCount(trend.attentionShapeScore)}`,
  ] : [
    `👁 Views:       ${formatCount(trend.totalViews)}`,
    `⚡ Views/hr:    ${formatCount(trend.viewsPerHour)}`,
    `🔁 Shares:      ${formatCount(trend.shareCount)}`,
    `🚀 Shares/hr:   ${formatCount(trend.shareVelocity)}`,
    `💬 Quote Vel:   ${formatCount(trend.quoteVelocity)}/hr`,
    `💬 Quotes:      ${formatCount(trend.quoteCount)}`,
    `❤️ Likes:       ${formatCount(trend.likeCount)}`,
    `📈 Momentum:    ${formatCount(trend.attentionMomentum)}`,
    `🧬 Prop Ratio:  ${formatRatio(trend.propagationRatio)}`,
  ];

  if (includeReplies) lines.push(`↩ Replies:      ${formatCount(trend.replyCount)}`);
  if (includeReposts) lines.push(`🔁 Reposts:     ${formatCount(trend.repostCount)}`);
  if (includeReposts) lines.push(`📈 Repost Vel:  ${formatCount(trend.repostVelocity)}/hr`);
  if (includeMedia && trend.mediaType) lines.push(`🎞 Media:       ${trend.mediaType}`);
  if (includeShape && trend.attentionShapeScore) lines.push(`🧲 Shape:       ${formatCount(trend.attentionShapeScore)}`);

  const body = lines.join("\n");
  return raw ? `${body}\n` : `<code>${escapeHtml(body)}</code>\n`;
}

function formatLabel(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .toUpperCase();
}

function formatRatio(value) {
  return Number(value || 0).toFixed(3);
}

function safeCallbackData(prefix, value) {
  const safePrefix = String(prefix || "cb").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10) || "cb";
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const maxBytes = TELEGRAM_CALLBACK_DATA_MAX_BYTES;
  let data = `${safePrefix}:${cleaned || "refresh"}`;
  while (Buffer.byteLength(data, "utf8") > maxBytes) {
    data = data.slice(0, -1);
  }
  return data || `${safePrefix}:refresh`;
}

function safeTelegramUrl(url, fallback) {
  try {
    const parsed = new URL(String(url || fallback));
    if (parsed.protocol === "https:") return parsed.toString();
  } catch (_) {}
  return fallback;
}

function labelSpread(score) {
  const value = Number(score || 0);
  if (value >= 220) return "HIGH";
  if (value >= 120) return "MEDIUM";
  return "LOW";
}

function labelPressure(score) {
  const value = Number(score || 0);
  if (value >= 70) return "HIGH";
  if (value >= 40) return "MEDIUM";
  return "LOW";
}

export function buildSafeInlineKeyboard(alert = null) {
  if (!alert || config.telegram.safeMode) {
    if (config.telegram.safeMode && alert) {
      console.log("   🧰 Telegram safe mode enabled; inline buttons disabled");
    }
    return null;
  }

  const buttons = [];
  if (alert.type === "refresh") {
    const callbackData = safeCallbackData("ref", alert.refreshId);
    const size = Buffer.byteLength(callbackData, "utf8");
    if (size > TELEGRAM_CALLBACK_DATA_MAX_BYTES) {
      console.log(`   ⚠️  Rejected refresh button payload (${size} bytes)`);
    } else {
      console.log(`   🔘 Telegram button refresh callback_data=${size} bytes`);
      buttons.push({ text: "Refresh", callback_data: callbackData });
    }
  }

  if (alert.url) {
    const url = validateHttpsUrl(alert.url);
    if (url) {
      buttons.push({ text: String(alert.urlLabel || "Open").slice(0, 32), url });
    } else {
      console.log(`   ⚠️  Rejected malformed Telegram button URL: ${String(alert.url).slice(0, 120)}`);
    }
  }

  if (buttons.length === 0) return null;

  try {
    const keyboard = new InlineKeyboard();
    for (const button of buttons) {
      if (button.callback_data) keyboard.text(button.text, button.callback_data);
      else if (button.url) keyboard.url(button.text, button.url);
    }
    return keyboard;
  } catch (err) {
    console.log(`   ⚠️  Inline keyboard build failed: ${err.message}`);
    return null;
  }
}

export function getTelegramAlertMetrics() {
  return { ...alertMetrics };
}

export async function simulateTelegramFallbackForTest(api, payload) {
  return sendTelegramWithFallback({
    label: "test-fallback",
    richHtml: payload.richHtml,
    compactHtml: payload.compactHtml,
    minimalText: payload.minimalText,
    keyboardAlert: payload.keyboardAlert,
    api,
  });
}

function validateHttpsUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function logTelegramPayload({ label, mode, keyboard }) {
  const keyboardSize = keyboard ? JSON.stringify(keyboard.inline_keyboard || keyboard).length : 0;
  console.log(`   📦 Telegram payload ${label} mode=${mode} keyboardBytes=${keyboardSize}`);
}

function isRateLimitError(err) {
  return err.message?.includes("429") || err.message?.includes("Too Many Requests");
}

function getRetryAfterSeconds(err, attempt) {
  const match = err.message?.match(/retry after (\d+)/i);
  return match ? parseInt(match[1], 10) + 1 : 5 * attempt;
}

function isButtonDataInvalid(err) {
  return err.message?.includes("BUTTON_DATA_INVALID");
}

function isTelegramBadRequest(err) {
  return err.message?.includes("400") || err.message?.includes("Bad Request");
}

function constrainTelegramMessage(message, { maxChars = TELEGRAM_MESSAGE_MAX_CHARS } = {}) {
  const text = String(message || "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 80)}\n\n<i>Truncated for Telegram delivery safety.</i>`;
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<a\s+href="([^"]+)">([^<]+)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMinimalAlertText({ title, name, score, sourceUrl }) {
  let text = `${title}\n\n${name || "Unknown"}`;
  if (score !== null && score !== undefined) text += `\nScore: ${score}/100`;
  const url = validateHttpsUrl(sourceUrl);
  if (url) text += `\nSource: ${url}`;
  return text;
}
