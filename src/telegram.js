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
      appendTelegramFooter("🐷 <b>OINK</b>\n\nTikTok attention → internet-native markets.\n\nJoin the channel for alerts!"),
      { parse_mode: "HTML", disable_web_page_preview: true }
    )
  );

  bot.command("status", (ctx) =>
    ctx.reply(appendTelegramFooter("✅ OINK is running. Scanning every 15 minutes."), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    })
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
      await ctx.editMessageText(appendTelegramFooter(message), {
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
      text: constrainTelegramMessage(appendTelegramFooter(richHtml)),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      },
    },
    {
      mode: "rich_no_buttons",
      text: constrainTelegramMessage(appendTelegramFooter(richHtml)),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
    },
    {
      mode: "compact",
      text: constrainTelegramMessage(appendTelegramFooter(compactHtml || richHtml)),
      options: {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
    },
    {
      mode: "minimal",
      text: constrainTelegramMessage(appendTelegramFooter(minimalText || htmlToPlainText(compactHtml || richHtml)), { maxChars: 3500 }),
      options: {
        parse_mode: "HTML",
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

export async function sendDeploymentReadyAlert(deploymentAttempt) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatDeploymentReadyAlert(deploymentAttempt);
  const sent = await sendTelegramWithFallback({
    label: `deployment:${deploymentAttempt.attemptId || deploymentAttempt.ticker}`,
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({
      title: "OINK DEPLOYMENT READY",
      name: `$${deploymentAttempt.ticker}`,
      score: deploymentAttempt.payload?.launchContext?.launchReadiness,
    }),
  });
  if (sent) console.log(`📤 Deployment diagnostic sent: $${deploymentAttempt.ticker}`);
  return sent;
}

export async function sendMetadataReadyAlert(deploymentAttempt) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");

  const message = formatMetadataReadyAlert(deploymentAttempt);
  const sent = await sendTelegramWithFallback({
    label: `metadata:${deploymentAttempt.attemptId || deploymentAttempt.ticker}`,
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({
      title: "OINK METADATA READY",
      name: `$${deploymentAttempt.ticker}`,
      score: deploymentAttempt.payload?.metadata?.imageUpload?.qualityScore,
    }),
  });
  if (sent) console.log(`📤 Metadata preview sent: $${deploymentAttempt.ticker}`);
  return sent;
}

export function formatMetadataReadyAlert(deploymentAttempt) {
  const payload = deploymentAttempt.payload || {};
  const metadata = payload.metadata || {};
  const imageAsset = metadata.imageUpload || {};
  const visualScore = imageAsset.visualScore || {};
  const metadataReady = payload.metadataState === "metadata_ready";

  let msg = `🐷 <b>OINK METADATA READY</b>\n\n`;
  msg += `Ticker:\n<b>$${escapeHtml(deploymentAttempt.ticker || payload.token?.symbol || "OINK")}</b>\n\n`;
  msg += `Name:\n<b>${escapeHtml(metadata.name || payload.token?.name || "Unknown")}</b>\n\n`;
  msg += `Image Status:\n<b>${escapeHtml(formatLabel(imageAsset.validationStatus || "image_needed"))}</b>\n\n`;
  msg += `Image Source:\n<b>${escapeHtml(imageAsset.imageSource || "GENERATED FALLBACK")}</b>\n\n`;
  msg += `Visual Score:\n<b>${Number(imageAsset.qualityScore || 0)}/100</b>\n\n`;
  msg += `Thumbnail Strength:\n<b>${escapeHtml(visualScore.thumbnailStrengthLabel || "LOW")}</b>\n\n`;
  msg += `Metadata:\n<b>${metadataReady ? "READY" : "NOT READY"}</b>\n\n`;
  msg += `Mode:\n<b>${escapeHtml(deploymentAttempt.mode || "DRY_WIRE")}</b>\n\n`;
  msg += `<code>`;
  msg += `Archetype: ${metadata.identityArchetype || "trendwave"}\n`;
  msg += `Image:     ${metadata.image ? "present" : "missing"}\n`;
  msg += `State:     ${payload.metadataState || "draft"}\n`;
  msg += `Prompt:    ${imageAsset.prompt ? "present" : "missing"}`;
  msg += `</code>\n`;
  if (payload.metadataValidation?.errors?.length) {
    msg += `\n<b>Metadata Blocks:</b>\n`;
    for (const error of payload.metadataValidation.errors.slice(0, 5)) msg += `• ${escapeHtml(error)}\n`;
  }
  msg += `\n<i>Dry-wire only. Metadata is prepared for review, not launch.</i>`;
  return constrainTelegramMessage(msg);
}

export function formatHostedAssetDiagnostics(deploymentAttempt) {
  const payload = deploymentAttempt.payload || {};
  const asset = payload.metadata?.imageUpload || {};
  const score = asset.artifactScore || asset.imageQualityReview?.artifactScore || {};
  const frozen = Boolean(asset.metadataFrozen || payload.hostedMetadata?.frozenPackage);

  let msg = `🐷 <b>OINK ASSET READY</b>\n\n`;
  msg += `Ticker:\n<b>$${escapeHtml(deploymentAttempt.ticker || payload.token?.symbol || "OINK")}</b>\n\n`;
  msg += `Image:\n<b>${asset.uploadedImageUrl || asset.imageUrl ? "HOSTED" : "NOT HOSTED"}</b>\n\n`;
  msg += `Thumbnail:\n<b>${asset.thumbnailUrl ? "READY" : "MISSING"}</b>\n\n`;
  msg += `Meme Readability:\n<b>${escapeHtml(score.memeReadabilityLabel || "UNKNOWN")}</b>\n\n`;
  msg += `Metadata:\n<b>${frozen ? "FROZEN" : "NOT FROZEN"}</b>\n\n`;
  msg += `Mode:\n<b>${escapeHtml(deploymentAttempt.mode || "DRY-WIRE")}</b>\n\n`;
  msg += `<code>`;
  msg += `Provider:  ${asset.uploadProvider || "n/a"}\n`;
  msg += `Status:    ${asset.uploadStatus || asset.validationStatus || "draft"}\n`;
  msg += `MIME:      ${asset.mimeType || "n/a"}\n`;
  msg += `Size:      ${Number(asset.width || 0)}x${Number(asset.height || 0)}\n`;
  msg += `Hash:      ${asset.hash || asset.frozenPackageHash || "n/a"}`;
  msg += `</code>\n\n`;
  msg += `<i>Asset hosting is prepared for review. Real launches remain disabled.</i>`;
  return constrainTelegramMessage(msg);
}

export function formatDeploymentReadyAlert(deploymentAttempt) {
  const payload = deploymentAttempt.payload || {};
  const context = payload.launchContext || {};
  const validation = deploymentAttempt.validation || {};
  const pumpPortal = deploymentAttempt.pumpPortal || {};
  const identity = payload.identity?.selected || {};
  const metadataPreview = payload.finalMetadataPreview || {};
  const finalGate = payload.finalLaunchGate || {};
  const vanity = payload.vanityMint || deploymentAttempt.vanityMint || {};

  let msg = `🐷 <b>OINK DEPLOYMENT READY</b>\n\n`;
  msg += `<b>$${escapeHtml(deploymentAttempt.ticker || payload.token?.symbol || "OINK")}</b>\n`;
  msg += `${escapeHtml(payload.token?.name || metadataPreview.name || "OINK Market")}\n`;
  msg += `Status: <b>${escapeHtml(formatLabel(deploymentAttempt.deploymentState || "payload_ready"))}</b>\n`;
  if (metadataPreview.sourceBacklink) {
    msg += `Source: <a href="${escapeHtml(safeTelegramUrl(metadataPreview.sourceBacklink, "https://x.com"))}">link</a>\n`;
  }
  msg += `\n`;
  msg += `Launch Readiness: <b>${Number(context.launchReadiness || 0)}/100</b>\n`;
  msg += `Identity Cohesion: <b>${Number(context.identityCohesion || identity.identityCohesionScore || 0)}/100</b>\n`;
  msg += `Naming Quality: <b>${Number(identity.namingQualityScore || 0)}/100</b>\n`;
  msg += `Ticker Quality: <b>${Number(identity.tickerQualityScore || 0)}/100</b>\n\n`;
  msg += `Deployment Status:\n<b>${escapeHtml(formatLabel(deploymentAttempt.deploymentState || "payload_ready"))}</b>\n\n`;
  msg += `PumpPortal:\n<b>${pumpPortal.connected ? "CONNECTED" : "OFFLINE"}</b>\n\n`;
  msg += `Mode:\n<b>${escapeHtml(deploymentAttempt.mode || "DRY_WIRE")}</b>\n\n`;
  if (vanity.suffixRequested || vanity.required) {
    msg += `<b>Vanity CA:</b>\n`;
    msg += `<code>`;
    msg += `requested: ${vanity.suffixRequested || "none"}\n`;
    msg += `found:     ${vanity.suffixFound ? "yes" : "no"}\n`;
    msg += `attempts:  ${Number(vanity.attempts || 0)}\n`;
    msg += `duration:  ${Number(vanity.durationMs || 0)}ms`;
    msg += `</code>\n\n`;
  }
  msg += `<b>Final Metadata Preview:</b>\n`;
  msg += `<code>`;
  msg += `name: ${metadataPreview.name || payload.token?.name || "n/a"}\n`;
  msg += `symbol: ${metadataPreview.symbol || deploymentAttempt.ticker || "n/a"}\n`;
  msg += `description: ${(metadataPreview.description || payload.token?.description || "n/a").slice(0, 88)}\n`;
  msg += `image URL: ${metadataPreview.imageUrl || payload.metadata?.image || "n/a"}\n`;
  msg += `metadata URL: ${metadataPreview.metadataUrl || payload.metadata?.hostedMetadataUrl || "n/a"}\n`;
  msg += `source backlink: ${metadataPreview.sourceBacklink || payload.metadata?.sourceBacklink || "n/a"}\n`;
  msg += `slogan fragments: ${(metadataPreview.sloganFragments || payload.metadata?.sloganFragments || []).join(" | ") || "n/a"}`;
  msg += `</code>\n\n`;
  msg += `<code>`;
  msg += `Name:       ${payload.token?.name || "n/a"}\n`;
  msg += `Phase:      ${context.narrativePhase || "forming"}\n`;
  msg += `Swarm:      ${Number(context.swarmPressure || 0)}/100\n`;
  msg += `Artifact:   ${payload.metadata?.sourceArtifactType || "symbolic_artifact"}\n`;
  msg += `Image:      ${payload.metadata?.imageUpload?.validationStatus || "image_needed"}\n`;
  msg += `Img Source: ${payload.metadata?.imageUpload?.imageSource || "GENERATED FALLBACK"}\n`;
  msg += `Img Label:  ${payload.metadata?.imageUpload?.imageQualityReview?.qualityLabel || payload.metadata?.imageQualityLabel || "UNKNOWN"}\n`;
  msg += `Metadata:   ${payload.metadataState || "draft"}\n`;
  msg += `Final Gate: ${finalGate.readyForFutureLiveLaunch ? "ready" : "blocked"}\n`;
  msg += `Valid:      ${validation.valid ? "yes" : "no"}`;
  msg += `</code>\n\n`;
  if (finalGate.blocks?.length) {
    msg += `<b>Final Gate Blocks:</b>\n`;
    for (const block of finalGate.blocks.slice(0, 5)) msg += `• ${escapeHtml(block)}\n`;
    msg += `\n`;
  }
  if (validation.errors?.length) {
    msg += `<b>Validation Errors:</b>\n`;
    for (const error of validation.errors.slice(0, 5)) msg += `• ${escapeHtml(error)}\n`;
    msg += `\n`;
  }
  if (validation.warnings?.length) {
    msg += `<b>Warnings:</b>\n`;
    for (const warning of validation.warnings.slice(0, 4)) msg += `• ${escapeHtml(warning)}\n`;
    msg += `\n`;
  }
  msg += `<i>Dry-wire only. No wallet, signature, transaction, or broadcast.</i>`;
  return constrainTelegramMessage(msg);
}

export function formatDeploymentAdapterAlert(deploymentAttempt) {
  const adapter = deploymentAttempt.adapter || {};
  const capabilities = adapter.capabilities || {};
  const compatibility = adapter.compatibility || {};

  let msg = `🐷 <b>OINK DEPLOYMENT ADAPTER</b>\n\n`;
  msg += `Provider:\n<b>${escapeHtml(adapter.provider || "PumpPortal")}</b>\n\n`;
  msg += `Capabilities:\n`;
  msg += `metadataUpload ${formatCapabilityIcon(capabilities.metadataUpload)}\n`;
  msg += `imageUpload ${formatCapabilityIcon(capabilities.imageUpload)}\n`;
  msg += `transactionPrep ${formatCapabilityIcon(capabilities.transactionPrep)}\n`;
  msg += `responseValidation ${formatCapabilityIcon(capabilities.responseValidation)}\n`;
  msg += `broadcast ${formatCapabilityIcon(capabilities.broadcast)}\n\n`;
  msg += `Compatibility:\n<b>${escapeHtml(compatibility.status || "STABLE")}</b>\n\n`;
  msg += `Mode:\n<b>${escapeHtml(adapter.mode || deploymentAttempt.mode || "DRY-WIRE")}</b>\n\n`;
  msg += `<code>`;
  msg += `Provider Ver: ${adapter.adapterVersion?.providerVersion || "unknown"}\n`;
  msg += `Schema Ver:   ${adapter.adapterVersion?.payloadSchemaVersion || "unknown"}\n`;
  msg += `Dry Wire:     ${adapter.dryWire ? "yes" : "no"}\n`;
  msg += `Broadcast:    ${adapter.broadcastEnabled ? "yes" : "no"}`;
  msg += `</code>`;
  if (compatibility.warnings?.length) {
    msg += `\n\n<b>Compatibility Notes:</b>\n`;
    for (const warning of compatibility.warnings.slice(0, 4)) msg += `• ${escapeHtml(warning)}\n`;
  }
  return constrainTelegramMessage(msg);
}

export function formatSaturationWarningAlert({ title = "OINK SATURATION WARNING", safety = {}, shadowLaunch = {} } = {}) {
  let msg = `🐷 <b>${escapeHtml(title)}</b>\n\n`;
  msg += `Ticker:\n<b>$${escapeHtml(shadowLaunch.ticker || safety.ticker || "OINK")}</b>\n\n`;
  msg += `Saturation:\n<b>${Number(safety.saturationScore || 0)}/100</b>\n\n`;
  msg += `Allowed:\n<b>${safety.allowed ? "YES" : "NO"}</b>\n\n`;
  msg += `<code>`;
  msg += `Blocks:   ${(safety.blocks || []).join(", ") || "none"}\n`;
  msg += `Warnings: ${(safety.warnings || []).join(", ") || "none"}\n`;
  msg += `Penalty:  ${Number(safety.launchOpportunityPenalty || 0)}`;
  msg += `</code>\n\n`;
  msg += `<i>No launch action taken. Saturation safety is advisory/blocking only.</i>`;
  return constrainTelegramMessage(msg);
}

export function formatTransactionSimulationAlert(deploymentAttempt) {
  const sim = deploymentAttempt.simulationResult || deploymentAttempt.payload?.transactionSimulation || {};
  let msg = `🐷 <b>OINK TX SIMULATION</b>\n\n`;
  msg += `Ticker:\n<b>$${escapeHtml(deploymentAttempt.ticker || sim.ticker || "OINK")}</b>\n\n`;
  msg += `Metadata:\n<b>${deploymentAttempt.payload?.metadataState === "metadata_ready" ? "READY" : "REVIEW"}</b>\n\n`;
  msg += `Simulation:\n<b>${escapeHtml(String(sim.status || "unknown").toUpperCase())}</b>\n\n`;
  msg += `Estimated Confirmation:\n<b>${Number((sim.latencies?.confirmationMs || 0) / 1000).toFixed(1)}s</b>\n\n`;
  msg += `Failure Risk:\n<b>${escapeHtml(sim.failureRisk || "LOW")}</b>\n\n`;
  msg += `Mode:\n<b>DRY-WIRE</b>\n\n`;
  msg += `<code>`;
  msg += `Metadata: ${Number(sim.latencies?.metadataPrepMs || 0)}ms\n`;
  msg += `Upload:   ${Number(sim.latencies?.uploadMs || 0)}ms\n`;
  msg += `Tx Prep:  ${Number(sim.latencies?.txPrepMs || 0)}ms\n`;
  msg += `Failure:  ${sim.failureClass || "none"}`;
  msg += `</code>`;
  return constrainTelegramMessage(msg);
}

export function formatTreasuryUpdateAlert({ diagnostics = {}, treasuryBalanceSol = diagnostics.cumulativeTreasuryGrowth || 0 } = {}) {
  const topLaunch = diagnostics.topLaunch || {};
  let msg = `🐷 <b>OINK TREASURY UPDATE</b>\n\n`;
  msg += `Creator Fees Claimed:\n<b>${Number(diagnostics.claimedFees || 0).toFixed(2)} SOL</b>\n\n`;
  msg += `Top Launch:\n<b>$${escapeHtml(topLaunch.ticker || "N/A")}</b>\n\n`;
  msg += `Cumulative Treasury:\n<b>${Number(treasuryBalanceSol || 0).toFixed(2)} SOL</b>\n\n`;
  msg += `Future Buyback Capacity:\n<b>${Number(treasuryBalanceSol || 0) > 0 ? "ACTIVE" : "PENDING"}</b>\n\n`;
  msg += `<code>`;
  msg += `Estimated: ${Number(diagnostics.estimatedCreatorFees || 0).toFixed(4)} SOL\n`;
  msg += `Pending:   ${Number(diagnostics.pendingClaims || 0)}\n`;
  msg += `Failed:    ${Number(diagnostics.failedClaims || 0)}`;
  msg += `</code>\n\n`;
  msg += `<i>Buyback routing is planned only. No automatic buybacks are active.</i>`;
  return constrainTelegramMessage(msg);
}

export async function sendTreasuryUpdateAlert(input) {
  if (!bot) throw new Error("Bot not initialized — call initBot() first");
  const message = formatTreasuryUpdateAlert(input);
  return sendTelegramWithFallback({
    label: "treasury:update",
    richHtml: message,
    compactHtml: message,
    minimalText: buildMinimalAlertText({ title: "OINK TREASURY UPDATE", name: "creator fees", score: null }),
  });
}

function formatCapabilityIcon(value) {
  if (value === true) return "✅";
  if (value === false || value == null) return "❌";
  return "⚠️";
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
  const isTikTok = payload.sourcePlatform === "tiktok";
  const sourceLabel = payload.sourcePlatform === "x" ? "X" : payload.sourcePlatform === "tiktok" ? "TikTok" : formatLabel(payload.sourcePlatform || "memory");
  const sourceUrl = payload.sourceUrl || payload.sourceBacklink || payload.relatedPosts?.[0]?.sourceUrl || "";
  const sourceAuthor = payload.sourceAuthor || payload.relatedPosts?.[0]?.author || "";
  const imageSource = payload.metadata?.imageUpload?.imageSource ||
    (payload.sourceMediaType === "cover_image"
      ? "TIKTOK COVER"
      : payload.sourceMediaUrl
        ? "SOURCE POST MEDIA"
        : "GENERATED");

  let msg = `🐷 <b>OINK PREPARE LAUNCH</b>\n\n`;
  msg += `<b>$${escapeHtml(shadowLaunch.ticker)}</b>\n`;
  msg += `${escapeHtml(shadowLaunch.title)}\n\n`;
  msg += `Source:\n<b>${escapeHtml(sourceLabel)}</b>\n`;
  if (sourceAuthor) msg += `Author:\n@${escapeHtml(sourceAuthor)}\n`;
  if (sourceUrl) {
    const fallback = payload.sourcePlatform === "tiktok" ? "https://www.tiktok.com" : payload.sourcePlatform === "x" ? "https://x.com" : "https://oink.bot";
    msg += `Source Post:\n<a href="${escapeHtml(safeTelegramUrl(sourceUrl, fallback))}">link</a>\n`;
  }
  msg += `\n`;
  if (isTikTok) {
    const tiktokTrendName = payload.relatedPosts?.[0]?.name || narrative.clusterName || shadowLaunch.title;
    msg += `Trend:\n<b>${escapeHtml(tiktokTrendName)}</b>\n\n`;
    msg += `Image:\n<b>${escapeHtml(imageSource)}</b>\n\n`;
    msg += `<b>Why It Qualified:</b>\n`;
    const reasons = payload.tiktokLaunchReasons || shadowLaunch.launchReasoning || [];
    for (const reason of reasons.slice(0, 4)) msg += `• ${escapeHtml(reason)}\n`;
    msg += `\n`;
    msg += `Deployment:\n<b>DRY RUN</b>\n\n`;
    msg += `<code>`;
    msg += `Readiness: ${Number(shadowLaunch.launchReadiness || 0)}/100\n`;
    msg += `Identity:  ${Number(payload.tiktokLaunchMetrics?.memeticIdentityScore || shadowLaunch.identity?.selected?.identityCohesionScore || 0)}/100\n`;
    msg += `Swarm:     ${Number(shadowLaunch.swarmPressure || 0)}/100\n`;
    msg += `Saturation:${Number(payload.tiktokLaunchMetrics?.saturationPressure || 0)}/100`;
    msg += `</code>\n\n`;
    msg += `<i>No transaction submitted. No wallet used.</i>`;
    return constrainTelegramMessage(msg);
  }
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

export function formatLaunchCandidateMessage({ trend, trendScore, launchScore, launchBrief, preparedLaunch, mode = "rich" }) {
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
  msg += `<b>${escapeHtml(ticker)}</b>\n`;
  msg += `${escapeHtml(launchedToken.name)}\n\n`;
  msg += `Status:\n<b>LIVE</b>\n\n`;
  msg += `Source:\n<b>${escapeHtml(getSourceLabel(trend))}</b>\n\n`;
  msg += `Launch Reason:\n`;
  const reasons = launchedToken.launchReasons || launchBrief.launchReasons || [
    "cross-community spread",
    "launch window prime",
    "identity cohesion high",
  ];
  for (const reason of reasons.slice(0, 3)) msg += `• ${escapeHtml(reason)}\n`;
  msg += `\n`;
  msg += `CA:\n`;
  msg += `<code>${escapeHtml(launchedToken.contractAddress || "pending")}</code>\n\n`;
  msg += `Pump.fun:\n`;
  if (launchedToken.launchUrl) {
    msg += `<a href="${escapeHtml(safeTelegramUrl(launchedToken.launchUrl, "https://pump.fun"))}">link</a>\n\n`;
  } else {
    msg += `pending\n\n`;
  }
  msg += `Source Post:\n`;
  msg += `<a href="${escapeHtml(safeTelegramUrl(launchBrief.sourceUrl || trend.sourceUrl, trend.sourcePlatform === "x" ? "https://x.com" : "https://www.tiktok.com"))}">link</a>\n\n`;
  msg += `Image:\n<b>${escapeHtml(launchedToken.imageSource || launchBrief.imageSource || "SOURCE POST MEDIA / GENERATED")}</b>\n\n`;
  if (launchedToken.txSignature) {
    const txUrl = safeTelegramUrl(`https://solscan.io/tx/${launchedToken.txSignature}`, "https://solscan.io");
    msg += `Tx:\n<a href="${escapeHtml(txUrl)}">${escapeHtml(txUrl)}</a>\n\n`;
  }
  if (launchedToken.launchScore !== undefined) {
    msg += `Launch Score:\n<b>${Number(launchedToken.launchScore || 0)}/100</b>\n\n`;
  }
  msg += `OINK Buyback Route:\n<b>${escapeHtml(launchedToken.buybackRoute || "pending")}</b>\n\n`;
  if (trend.sourcePlatform === "x" && launchBrief.socialTag) {
    msg += `X Narrative Tag:\n${escapeHtml(launchBrief.socialTag)}\n\n`;
  }
  msg += `Flywheel:\nLaunch Fees → $OINK Buybacks\n`;
  if (feeSummary) msg += `${escapeHtml(sanitizePublicFlywheelText(feeSummary))}\n`;

  return constrainTelegramMessage(msg);
}

function sanitizePublicFlywheelText(value = "") {
  return String(value || "")
    .replace(/\bcurrent model\s*:\s*/gi, "")
    .replace(/\b\d+(?:\.\d+)?%\s*(?:buybacks?|treasury|ops|operations?)\b/gi, (match) => match.replace(/\d+(?:\.\d+)?%\s*/g, ""))
    .replace(/\b\d+(?:\.\d+)?%\b/g, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/:\s*,/g, ":")
    .replace(/\s{2,}/g, " ")
    .trim();
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

export function appendTelegramFooter(message = "") {
  const text = String(message || "");
  const footer = config.telegram.footer || {};
  if (!footer.enabled) return text;

  const footerUrl = validateHttpsUrl(footer.url);
  if (!footerUrl) return text;

  const label = String(footer.linkLabel || "Padre").trim() || "Padre";
  if (text.includes(footerUrl) || text.includes(`>${label}</a>`) || text.includes(">Padre</a>")) return text;

  const footerText = String(footer.text || "Save 40% on all fees:").trim();
  return `${text.trimEnd()}\n\n<b>${escapeHtml(footerText)}</b>\n<a href="${escapeHtml(footerUrl)}">${escapeHtml(label)}</a>`;
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
