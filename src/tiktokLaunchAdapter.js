import { applyArtifactIntelligence } from "./artifacts.js";
import { applySourceMedia, getBestSourceMedia } from "./sourceMedia.js";
import { getViewsPerHour } from "./tiktok.js";

const GENERIC_HASHTAGS = new Set([
  "fyp", "foryou", "foryoupage", "viral", "trending", "funny", "love",
  "food", "music", "dance", "fashion", "beauty", "fitness", "motivation",
  "lifestyle", "family", "home", "travel", "news", "sports", "comedy",
  "relatable", "storytime", "pov", "grwm", "ootd", "duet", "stitch",
]);

const ENGAGEMENT_BAIT = /\b(follow|like|comment|share|duet|stitch|teamwork|make friends|live|gift|creator|support me|help me|please)\b/i;

export function evaluateTikTokLaunchCandidate(trend, { token = null } = {}) {
  const enriched = applySourceMedia(applyArtifactIntelligence({ ...trend, sourcePlatform: trend.sourcePlatform || "tiktok" }));
  const metrics = scoreTikTokMemeticPotential(enriched);
  const rejections = getTikTokLaunchRejections(enriched, metrics, token);
  const reasons = buildTikTokLaunchReasons(enriched, metrics, token);
  return {
    qualified: rejections.length === 0,
    rejections,
    reasons,
    metrics,
    trend: enriched,
  };
}

export function convertTikTokTrendToLaunchCluster(trend, { token = null } = {}) {
  const evaluation = evaluateTikTokLaunchCandidate(trend, { token });
  const t = evaluation.trend;
  const m = evaluation.metrics;
  const phrase = t.memeticArtifact?.extractedPhrase || cleanName(t.name);
  const sourceMediaValid = Boolean(t.sourceMedia?.validation?.valid || t.sourceMedia?.preferred);
  const artifactStrength = Math.max(
    Number(t.memeticArtifact?.artifactStrength || 0),
    Number(m.memeticIdentityScore || 0),
    sourceMediaValid ? 75 : 0
  );
  const clusterId = `tiktok-${String(t.id || phrase).replace(/[^a-z0-9_-]/gi, "").slice(0, 80)}`;
  const sourceUrl = getTikTokSourceUrl(t);
  const sourceMedia = t.sourceMedia || null;
  return {
    clusterId,
    canonicalEntity: t.memeticArtifact?.tokenIdentity || phrase,
    aliases: [t.name, phrase].filter(Boolean),
    archetype: t.type === "song" ? "trendwave" : "phrase",
    lifecycleState: m.launchReadiness >= 82 ? "forming" : "emerging",
    launchWindow: m.launchReadiness >= 82 ? "FORMING_WINDOW" : "WATCH",
    idealLaunchTiming: m.launchReadiness >= 82 ? "soon" : "watch",
    launchReadiness: m.launchReadiness,
    launchWorthinessScore: m.launchReadiness,
    recommendation: m.launchReadiness >= 82 ? "EARLY_OPPORTUNITY" : "WATCH",
    phaseRecommendation: m.launchReadiness >= 82 ? "PREPARE_LAUNCH" : "WATCH",
    marketStatus: token?.matchStatus === "canonical" ? "canonical" : "unclaimed",
    swarmPressure: m.swarmPressure,
    saturationPressure: m.saturationPressure,
    identityFormationScore: Math.max(m.memeticIdentityScore, sourceMediaValid ? 78 : 0),
    propagationPersistence: m.trendCurveStrength,
    remixGrowthRate: m.remixability,
    quoteChainExpansion: 0,
    artifactStrength,
    sourceArtifactType: t.memeticArtifact?.artifactType || (t.type === "song" ? "audio_artifact" : "phrase_artifact"),
    visualReuseMode: t.sourceMedia?.preferred ? "reuse_source_media" : t.memeticArtifact?.visualReuseMode || "generate_new_image",
    extractedPhrase: phrase,
    emotionalTexture: t.memeticArtifact?.emotionalTexture || "internet curiosity",
    identityCompressionSummary: t.memeticArtifact?.identityCompressionSummary || `${phrase} TikTok trend compressed into launch identity.`,
    artifactSuggestedTicker: t.memeticArtifact?.suggestedTicker || "",
    memeticArtifact: t.memeticArtifact,
    relatedPhrases: [phrase, ...(t.memeticArtifact?.artifacts?.phraseArtifacts || [])].filter(Boolean).slice(0, 5),
    relatedAccounts: [],
    relatedPosts: [{
      id: t.id,
      sourcePlatform: "tiktok",
      sourceUrl,
      name: t.name,
      author: t.artist || "",
      sourceMedia,
      sourceMediaUrl: t.sourceMediaUrl || t.coverImage || t.thumbnailUrl || "",
      sourceMediaType: t.sourceMediaType || (t.coverImage || t.thumbnailUrl ? "cover_image" : ""),
    }],
    tiktokLaunchMetrics: m,
    tiktokLaunchReasons: evaluation.reasons,
    tiktokLaunchRejections: evaluation.rejections,
  };
}

export function scoreTikTokMemeticPotential(trend) {
  const viewsPerHour = Number(trend.viewsPerHour || getViewsPerHour(trend) || 0);
  const videoCount = Number(trend.videoCount || 0);
  const rank = Number(trend.rank || 999);
  const rankMovement = trend.rankChangeType === 3 ? 100 : trend.rankChangeType === 1 ? Math.min(100, Number(trend.rankChange || 0) * 5) : 0;
  const acceleration = Number(trend.acceleration || 1);
  const trendCurveStrength = scoreTrendCurve(trend.trendCurve || trend.trend || []);
  const creatorParticipation = scoreCreatorParticipation(videoCount, viewsPerHour);
  const artifact = trend.memeticArtifact || {};
  const sourceMedia = getBestSourceMedia({ sourceMedia: trend.sourceMedia });
  const phraseIdentity = scorePhraseIdentity(cleanName(trend.name), artifact);
  const soundIdentity = trend.type === "song" ? clamp(50 + (trend.artist ? 15 : 0) + (artifact.artifactStrength || 0) * 0.25) : 55;
  const visualCoverStrength = sourceMedia.validation.valid ? 82 : 35;
  const remixability = clamp(
    Number(artifact.scores?.remixability || 0) * 0.45 +
    creatorParticipation * 0.25 +
    trendCurveStrength * 0.2 +
    (sourceMedia.validation.valid ? 10 : 0)
  );
  const saturationPressure = clamp(
    (videoCount >= 50_000 ? 45 : videoCount >= 20_000 ? 28 : videoCount >= 10_000 ? 18 : 6) +
    (viewsPerHour >= 2_000_000 && videoCount >= 20_000 ? 25 : 0) +
    (rank > 80 ? 8 : 0)
  );
  const swarmPressure = clamp(saturationPressure * 0.55 + (isGenericName(trend.name) ? 25 : 0));
  const memeticIdentityScore = clamp(
    phraseIdentity * 0.36 +
    soundIdentity * 0.06 +
    visualCoverStrength * 0.2 +
    remixability * 0.22 +
    Number(artifact.artifactStrength || 0) * 0.16
  );
  const launchReadiness = clamp(
    scoreViewsPerHour(viewsPerHour) * 0.2 +
    creatorParticipation * 0.14 +
    rankMovement * 0.15 +
    scoreAcceleration(acceleration) * 0.18 +
    trendCurveStrength * 0.15 +
    memeticIdentityScore * 0.28 -
    saturationPressure * 0.22
  );
  return {
    viewsPerHour,
    videoCountGrowth: creatorParticipation,
    rankMovement,
    accelerationScore: scoreAcceleration(acceleration),
    trendCurveStrength,
    creatorParticipation,
    remixability,
    phraseIdentity,
    soundIdentity,
    visualCoverStrength,
    saturationPressure,
    swarmPressure,
    memeticIdentityScore,
    launchReadiness,
  };
}

function getTikTokLaunchRejections(trend, metrics, token) {
  const rejections = [];
  if (trend.trendDirection === "falling") rejections.push("trend_falling");
  if (isGenericName(trend.name)) rejections.push("generic_or_broad_hashtag");
  if (ENGAGEMENT_BAIT.test(trend.name)) rejections.push("engagement_bait");
  if (metrics.saturationPressure > 40) rejections.push("tiktok_saturation_pressure_high");
  if (Number(trend.rank || 999) > 80 && trend.rankChangeType !== 1 && trend.rankChangeType !== 3) rejections.push("rank_too_low_without_momentum");
  if (Number(trend.acceleration || 1) < 1.15) rejections.push("acceleration_weak");
  if (metrics.trendCurveStrength < 58) rejections.push("trend_curve_flat");
  if (metrics.memeticIdentityScore < 75) rejections.push("memetic_identity_below_threshold");
  if (!trend.memeticArtifact?.extractedPhrase && !trend.memeticArtifact?.artifacts?.audioArtifacts?.length) rejections.push("no_usable_phrase_sound_or_visual_identity");
  const media = getBestSourceMedia({ sourceMedia: trend.sourceMedia });
  if (!media.validation.valid && (trend.memeticArtifact?.artifactStrength || 0) < 78) rejections.push("no_source_media_and_generic_visual_prompt");
  if (token?.matchStatus === "canonical") rejections.push("canonical_market_already_exists");
  if (metrics.launchReadiness < 75) rejections.push("launch_readiness_below_threshold");
  if (metrics.saturationPressure > 40) rejections.push("saturation_pressure_above_threshold");
  if (metrics.swarmPressure > 40) rejections.push("swarm_pressure_above_threshold");
  return [...new Set(rejections)];
}

function buildTikTokLaunchReasons(trend, metrics, token) {
  const reasons = [];
  if (metrics.viewsPerHour >= 100_000) reasons.push("hashtag velocity rising");
  if (metrics.creatorParticipation >= 65) reasons.push("creator participation expanding");
  if (trend.rankChangeType === 1 || trend.rankChangeType === 3) reasons.push("rank climbing");
  if (metrics.trendCurveStrength >= 70) reasons.push("trend curve accelerating");
  if (metrics.remixability >= 70 || trend.type === "song") reasons.push("sound/format is remixable");
  if (!token || token.matchStatus !== "canonical") reasons.push("no canonical market found");
  if (metrics.memeticIdentityScore >= 75) reasons.push("identity cohesion high");
  return reasons.slice(0, 5);
}

function scoreViewsPerHour(vph) {
  if (vph >= 1_000_000) return 100;
  if (vph >= 500_000) return 88;
  if (vph >= 200_000) return 74;
  if (vph >= 100_000) return 62;
  return clamp((vph / 100_000) * 62);
}

function scoreCreatorParticipation(videoCount, viewsPerHour) {
  const density = viewsPerHour / Math.max(1, videoCount);
  return clamp(
    (videoCount >= 2_000 ? 32 : videoCount / 2_000 * 32) +
    (videoCount <= 20_000 ? 20 : 6) +
    (density >= 150 ? 28 : density / 150 * 28)
  );
}

function scoreAcceleration(acceleration) {
  if (acceleration >= 1.7) return 100;
  if (acceleration >= 1.45) return 86;
  if (acceleration >= 1.25) return 72;
  if (acceleration >= 1.15) return 60;
  return clamp(acceleration * 45);
}

function scoreTrendCurve(curve = []) {
  if (!Array.isArray(curve) || curve.length < 3) return 62;
  const values = curve.map((point) => Number(point.value ?? point)).filter(Number.isFinite);
  if (values.length < 3) return 62;
  const first = avg(values.slice(0, Math.ceil(values.length / 3)));
  const mid = avg(values.slice(Math.floor(values.length / 3), Math.ceil(values.length * 2 / 3)));
  const last = avg(values.slice(Math.floor(values.length * 2 / 3)));
  const slope = last - first;
  const accelerating = last > mid && mid >= first;
  return clamp(45 + (accelerating ? 25 : 0) + Math.min(30, Math.max(0, slope) * 0.3));
}

function scorePhraseIdentity(name, artifact) {
  const words = name.split(/\s+/).filter(Boolean);
  return clamp(
    45 +
    (name.length >= 3 && name.length <= 18 ? 18 : 0) +
    (words.length <= 3 ? 10 : 0) +
    (artifact.extractedPhrase ? 12 : 0) +
    Number(artifact.artifactStrength || 0) * 0.18
  );
}

function isGenericName(name = "") {
  const clean = cleanName(name).toLowerCase();
  if (!clean) return true;
  if (GENERIC_HASHTAGS.has(clean.replace(/\s+/g, ""))) return true;
  return clean.split(/\s+/).some((word) => GENERIC_HASHTAGS.has(word));
}

function getTikTokSourceUrl(trend) {
  if (trend.sourceUrl) return trend.sourceUrl;
  const clean = cleanName(trend.name).replace(/\s+/g, "");
  if (trend.type === "song") return "https://www.tiktok.com/music";
  return `https://www.tiktok.com/tag/${encodeURIComponent(clean)}`;
}

function cleanName(name = "") {
  return String(name || "").replace(/^#/, "").replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}
