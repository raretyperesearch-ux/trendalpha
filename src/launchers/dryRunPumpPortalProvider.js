import { selectMemeticIdentity } from "../memeticNameEngine.js";

const WEAK_TICKER_WORDS = new Set([
  "the", "this", "that", "viral", "meme", "coin", "token", "pump", "fun",
  "inu", "ai", "official", "real", "new", "launch", "trend", "x",
]);

const POLLUTED_SUFFIXES = /(INU|AIINU|PUMP|COIN|TOKEN|SOL|ETH|BASE|100X)$/i;

export class DryRunPumpPortalProvider {
  constructor({ existingTickers = [] } = {}) {
    this.existingTickers = new Set(existingTickers.map((ticker) => normalizeTicker(ticker)));
  }

  prepareClusterLaunch(cluster) {
    const identity = selectMemeticIdentity(cluster, { existingTickers: [...this.existingTickers] });
    const title = identity.selected?.name || buildTokenName(cluster);
    const ticker = identity.selected?.ticker || this.generateTicker(cluster, title);
    this.existingTickers.add(ticker);
    const narrativeSummary = buildNarrativeSummary(cluster);
    const launchReasoning = buildLaunchReasoning(cluster);
    const launchConfidence = getLaunchConfidence(cluster);
    const artifact = cluster.memeticArtifact || {};
    const sourcePost = getBestSourcePost(cluster);
    const sourceMedia = sourcePost?.sourceMedia || null;
    const payload = {
      platform: "pumpportal",
      deploymentMode: "dry_run",
      status: "simulated",
      sourcePlatform: getSourcePlatform(cluster),
      sourceUrl: sourcePost?.sourceUrl || "",
      sourceAuthor: sourcePost?.author || "",
      sourceBacklink: sourcePost?.sourceUrl || "",
      sourceMedia,
      sourceMediaUrl: sourcePost?.sourceMediaUrl || sourceMedia?.preferred?.sourceMediaUrl || "",
      sourceMediaType: sourcePost?.sourceMediaType || sourceMedia?.preferred?.mediaType || "",
      relatedPosts: getRelatedPostReferences(cluster),
      sourceArtifactType: cluster.sourceArtifactType || artifact.artifactType || "symbolic_artifact",
      artifactStrength: Math.round(Number(cluster.artifactStrength || artifact.artifactStrength || 0)),
      visualReuseMode: cluster.visualReuseMode || artifact.visualReuseMode || "generate_new_image",
      extractedPhrase: cluster.extractedPhrase || artifact.extractedPhrase || "",
      emotionalTexture: cluster.emotionalTexture || artifact.emotionalTexture || "internet curiosity",
      identityCompressionSummary: cluster.identityCompressionSummary || artifact.identityCompressionSummary || "",
      tiktokLaunchMetrics: cluster.tiktokLaunchMetrics || null,
      tiktokLaunchReasons: cluster.tiktokLaunchReasons || null,
      tiktokLaunchRejections: cluster.tiktokLaunchRejections || null,
      lifecycleState: getDryRunLifecycleState(cluster),
      token: {
        name: title,
        ticker,
        description: buildPumpDescription({ title, ticker, narrativeSummary, cluster }),
      },
      identity,
      narrative: {
        clusterId: cluster.clusterId,
        clusterName: cluster.canonicalEntity,
        summary: narrativeSummary,
        archetype: cluster.archetype || "trendwave",
        phase: cluster.lifecycleState || "forming",
        launchReadiness: Math.round(Number(cluster.launchReadiness || 0)),
        swarmPressure: Math.round(Number(cluster.swarmPressure || 0)),
        identityStrength: getIdentityStrength(cluster),
      },
      launchReasoning,
      launchConfidence,
      launchTiming: {
        idealLaunchWindow: cluster.launchWindow || "WATCH",
        idealLaunchTiming: cluster.idealLaunchTiming || "watch",
        accelerationTiming: cluster.accelerationInflectionPoint || "stable",
        breakoutTiming: cluster.crossCommunityBreakoutTiming || "none",
        saturationTiming: getSaturationTiming(cluster),
      },
      imagePrompt: buildImagePrompt({ title, ticker, cluster }),
      socialPostDraft: {
        x: buildXDraft({ title, ticker, cluster }),
        telegram: buildTelegramDraft({ title, ticker, cluster }),
        pumpfunDescription: buildPumpDescription({ title, ticker, narrativeSummary, cluster }),
      },
      audit: buildAudit(cluster, ticker, identity),
      note: "Dry run only. No transaction submitted. No wallet used.",
      createdAt: new Date().toISOString(),
    };

    return {
      launchId: buildLaunchId(cluster, ticker),
      clusterId: cluster.clusterId,
      ticker,
      title,
      launchReadiness: payload.narrative.launchReadiness,
      narrativePhase: payload.narrative.phase,
      swarmPressure: payload.narrative.swarmPressure,
      identityStrength: payload.narrative.identityStrength,
      identity,
      launchReasoning,
      payload,
    };
  }

  generateTicker(cluster, title) {
    const candidates = [
      cluster.artifactSuggestedTicker || cluster.memeticArtifact?.suggestedTicker || "",
      cluster.extractedPhrase || cluster.memeticArtifact?.extractedPhrase || "",
      cluster.emotionalTexture || cluster.memeticArtifact?.emotionalTexture || "",
      ...buildTickerCandidates(title),
      ...buildTickerCandidates(cluster.canonicalEntity || ""),
      ...(cluster.relatedPhrases || []).flatMap(buildTickerCandidates),
    ];

    for (const candidate of candidates) {
      const ticker = normalizeTicker(candidate);
      if (isStrongTicker(ticker) && !this.existingTickers.has(ticker)) {
        this.existingTickers.add(ticker);
        return ticker;
      }
    }

    const fallback = normalizeTicker(title).slice(0, 6) || "OINK";
    let suffix = 2;
    let ticker = fallback;
    while (this.existingTickers.has(ticker) && suffix < 100) {
      ticker = `${fallback.slice(0, Math.max(1, 8 - String(suffix).length))}${suffix}`;
      suffix += 1;
    }
    this.existingTickers.add(ticker);
    return ticker;
  }
}

export function prepareDryRunPumpPortalLaunch(cluster, options = {}) {
  return new DryRunPumpPortalProvider(options).prepareClusterLaunch(cluster);
}

function buildTokenName(cluster) {
  const source = cluster.memeticArtifact?.tokenIdentity || cluster.extractedPhrase || cluster.canonicalEntity || cluster.relatedPhrases?.[0] || "OINK Narrative";
  const cleaned = titleCase(source).replace(/\b(Viral|Meme|Coin|Token|Official)\b/gi, "").replace(/\s+/g, " ").trim();
  if (cleaned.length >= 3 && cleaned.length <= 32) return cleaned;
  return titleCase(cleaned.split(/\s+/).slice(0, 3).join(" ") || "OINK Narrative");
}

function buildTickerCandidates(text = "") {
  const words = cleanWords(text);
  const joined = words.join("");
  const initials = words.map((word) => word[0]).join("");
  const candidates = [];
  if (joined) candidates.push(joined);
  if (initials.length >= 3) candidates.push(initials);
  for (const word of words) candidates.push(word);
  if (words.length >= 2) candidates.push(words.slice(0, 2).join(""));
  return candidates;
}

function isStrongTicker(ticker) {
  if (!ticker || ticker.length < 3 || ticker.length > 10) return false;
  if (!/^[A-Z0-9]+$/.test(ticker)) return false;
  if (POLLUTED_SUFFIXES.test(ticker) && ticker.length > 5) return false;
  if ([...WEAK_TICKER_WORDS].some((word) => ticker === word.toUpperCase())) return false;
  if (/([A-Z0-9])\1{3,}/.test(ticker)) return false;
  return true;
}

function normalizeTicker(value = "") {
  return String(value).replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function cleanWords(text = "") {
  return String(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !WEAK_TICKER_WORDS.has(word.toLowerCase()))
    .slice(0, 5);
}

function buildNarrativeSummary(cluster) {
  return [
    `${cluster.canonicalEntity} is a ${cluster.lifecycleState || "forming"} OINK narrative cluster.`,
    `It has ${cluster.relatedPosts?.length || 0} tracked post(s), ${cluster.relatedAccounts?.length || 0} account(s), and ${Math.round(cluster.launchReadiness || 0)}/100 launch readiness.`,
    `Current window: ${cluster.launchWindow || "WATCH"}; ideal timing: ${cluster.idealLaunchTiming || "watch"}.`,
  ].join(" ");
}

function buildLaunchReasoning(cluster) {
  const reasons = [];
  if ((cluster.launchReadiness || 0) >= 80) reasons.push("Launch readiness is high.");
  if (cluster.launchWindow === "PRIME_WINDOW") reasons.push("Narrative is inside the prime timing window.");
  if (cluster.launchWindow === "FORMING_WINDOW") reasons.push("Narrative is forming before full saturation.");
  if ((cluster.swarmPressure || 0) <= 35) reasons.push("Swarm pressure remains low.");
  if ((cluster.quoteChainExpansion || 0) >= 50) reasons.push("Quote-chain expansion supports remix potential.");
  if ((cluster.remixGrowthRate || 0) >= 45) reasons.push("Remix growth indicates marketable identity formation.");
  if ((cluster.artifactStrength || 0) >= 70) reasons.push("Memetic artifact strength supports identity compression.");
  if ((cluster.saturationPressure || 0) >= 60) reasons.push("Saturation pressure requires timing caution.");
  if (cluster.copycatSwarm) reasons.push("Copycat swarm detected; dry-run only.");
  return reasons.length ? reasons : ["Narrative passed dry-run preparation review."];
}

function getLaunchConfidence(cluster) {
  let confidence = Number(cluster.launchReadiness || 0);
  if (cluster.launchWindow === "PRIME_WINDOW") confidence += 6;
  if (cluster.launchWindow === "FORMING_WINDOW") confidence += 3;
  confidence -= Number(cluster.swarmPressure || 0) * 0.12;
  confidence -= Number(cluster.saturationPressure || 0) * 0.1;
  return clamp(Math.round(confidence), 0, 100);
}

function getIdentityStrength(cluster) {
  let strength = Number(cluster.identityFormationScore || 0);
  if (!strength) {
    strength = Number(cluster.launchReadiness || 0) * 0.45 +
      Number(cluster.remixGrowthRate || 0) * 0.25 +
      Number(cluster.propagationPersistence || 0) * 0.3;
  }
  return clamp(Math.round(strength), 0, 100);
}

function getSaturationTiming(cluster) {
  if ((cluster.saturationPressure || 0) >= 70) return "immediate_risk";
  if ((cluster.saturationPressure || 0) >= 50) return "approaching";
  return "low";
}

function getDryRunLifecycleState(cluster) {
  if (cluster.lifecycleState === "reigniting") return "reigniting";
  if (cluster.lifecycleState === "saturated" || (cluster.saturationPressure || 0) >= 70) return "saturating";
  if (cluster.lifecycleState === "decaying") return "collapsing";
  if ((cluster.propagationPersistence || 0) >= 70) return "surviving";
  return "simulated";
}

function buildImagePrompt({ title, ticker, cluster }) {
  const artifact = cluster.memeticArtifact || {};
  const reuse = cluster.visualReuseMode || artifact.visualReuseMode || "generate_new_image";
  const texture = cluster.emotionalTexture || artifact.emotionalTexture || "internet-native";
  const phrase = cluster.extractedPhrase || artifact.extractedPhrase || title;
  return `Clean OINK-style internet-native token visual for "${title}" ($${ticker}). Artifact: ${cluster.sourceArtifactType || artifact.artifactType || "symbolic_artifact"}; visual plan: ${reuse}; phrase: "${phrase}"; emotional texture: ${texture}. Create a bold simple mascot or symbolic mark that references the narrative without copying protected brands, high contrast, readable at tiny size, playful but not cluttered.`;
}

function buildXDraft({ title, ticker, cluster }) {
  return [
    "OINK detected a narrative entering a market formation window.",
    "",
    `${title} ($${ticker}) is prepared as a dry-run attention-market candidate.`,
    `Phase: ${String(cluster.lifecycleState || "forming").toUpperCase()}`,
    `Window: ${cluster.launchWindow || "WATCH"}`,
    "",
    "No launch submitted. Dry-run metadata only.",
  ].join("\n");
}

function buildTelegramDraft({ title, ticker, cluster }) {
  return `OINK dry-run prepared ${title} ($${ticker}) from ${cluster.canonicalEntity}. Phase: ${String(cluster.lifecycleState || "forming").toUpperCase()}. Window: ${cluster.launchWindow || "WATCH"}.`;
}

function buildPumpDescription({ title, ticker, narrativeSummary }) {
  return `${title} ($${ticker}) is an OINK dry-run attention-market candidate. ${narrativeSummary} Prepared only; no transaction submitted.`;
}

function getSourcePlatform(cluster) {
  const platforms = new Set((cluster.relatedPosts || []).map((post) => post.sourcePlatform).filter(Boolean));
  if (platforms.has("x") && platforms.has("tiktok")) return "cross_platform";
  if (platforms.has("tiktok")) return "tiktok";
  if (platforms.has("x")) return "x";
  return "memory";
}

function getBestSourcePost(cluster) {
  const posts = cluster.relatedPosts || [];
  return posts.find((post) => post.sourceMedia?.preferred || post.sourceMediaUrl) ||
    posts.find((post) => post.sourceUrl) ||
    posts[0] ||
    null;
}

function getRelatedPostReferences(cluster) {
  return (cluster.relatedPosts || []).slice(0, 6).map((post) => ({
    id: post.id,
    sourcePlatform: post.sourcePlatform,
    sourceUrl: post.sourceUrl,
    name: post.name || "",
    author: post.author,
    sourceMedia: post.sourceMedia || null,
    sourceMediaUrl: post.sourceMediaUrl || "",
    sourceMediaType: post.sourceMediaType || "",
  }));
}

function buildAudit(cluster, ticker, identity = null) {
  const rejected = [];
  if ((cluster.launchReadiness || 0) < 70) rejected.push("launch_readiness_below_dry_run_threshold");
  if ((cluster.swarmPressure || 0) >= 60) rejected.push("high_swarm_pressure");
  if ((cluster.saturationPressure || 0) >= 70) rejected.push("saturation_rejection");
  if (!isStrongTicker(ticker)) rejected.push("weak_ticker");
  if (identity && !identity.ready) rejected.push(identity.blockReason || "identity_quality_below_threshold");
  return {
    rejectedLaunches: rejected,
    weakIdentity: getIdentityStrength(cluster) < 45,
    identityRejected: identity && !identity.ready,
    identityRejectionReason: identity && !identity.ready ? identity.blockReason : "",
    saturationRejection: (cluster.saturationPressure || 0) >= 70,
    launchTimingWindow: cluster.launchWindow || "WATCH",
    tickerCollision: false,
  };
}

function buildLaunchId(cluster, ticker) {
  return `dry-${cluster.clusterId || "cluster"}-${ticker}-${Date.now()}`;
}

function titleCase(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
