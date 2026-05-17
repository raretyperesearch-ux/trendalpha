const EMOTION_WORDS = {
  awe: ["insane", "unbelievable", "no way", "wild", "crazy", "stunned"],
  joy: ["hilarious", "funniest", "crying", "laughing", "killed me", "lol"],
  tension: ["awkward", "tense", "caught", "exposed", "wait", "what"],
  tenderness: ["cute", "sweet", "heartwarming", "wholesome"],
  chaos: ["chaos", "mess", "crash", "fight", "meltdown"],
};

const SYMBOL_WORDS = [
  "hat", "mask", "sign", "shirt", "car", "robot", "alien", "banana", "chair",
  "phone", "poster", "flag", "bag", "shoe", "camera", "mic", "helmet",
];

const MASCOT_WORDS = [
  "dog", "cat", "animal", "bear", "bird", "fish", "frog", "rat", "squirrel",
  "robot", "alien", "mascot", "baby", "kid", "monkey", "horse",
];

const BEHAVIOR_WORDS = [
  "dance", "stare", "run", "walk", "fall", "jump", "wait", "scream", "laugh",
  "cry", "cook", "throw", "sing", "point", "freeze",
];

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "from", "have", "what", "when", "where",
  "just", "like", "will", "your", "their", "about", "there", "been", "into",
  "after", "before", "over", "under", "video", "clip", "photo", "picture",
  "moment", "watch", "look", "people", "someone", "today", "here", "viral",
  "trending", "meme", "post", "no", "way", "insane", "wild", "crazy",
]);

export class CrossPlatformArtifactEngine {
  extract(input) {
    const sourcePlatform = input?.sourcePlatform || "unknown";
    const base = sourcePlatform === "tiktok"
      ? this.extractTikTok(input)
      : this.extractX(input);
    const scores = scoreArtifact(base, input);
    const identity = compressIdentity(base, input, scores);

    return {
      sourcePlatform,
      artifactType: getPrimaryArtifactType(base),
      artifacts: base,
      artifactStrength: scores.total,
      artifactStrengthLabel: labelScore(scores.total),
      scores,
      visualReuseMode: getVisualReuseMode(base, input, scores),
      extractedPhrase: base.phraseArtifacts[0] || "",
      emotionalTexture: base.emotionalArtifacts[0] || "curious",
      suggestedTicker: identity.ticker,
      tokenIdentity: identity.name,
      launchFraming: identity.launchFraming,
      identityCompressionSummary: identity.summary,
      recommendedAction: getRecommendedAction(base, input, scores),
    };
  }

  extractTikTok(trend) {
    const text = `${trend.name || ""} ${trend.artist || ""}`.trim();
    const phrases = extractPhrases(text);
    const emotions = extractEmotions(text);
    const mascots = extractMatches(text, MASCOT_WORDS);
    const symbols = extractMatches(text, SYMBOL_WORDS);
    const behaviors = extractMatches(text, BEHAVIOR_WORDS);

    return {
      visualArtifacts: trend.type === "hashtag" ? [`hashtag frame: ${cleanText(trend.name)}`] : [],
      phraseArtifacts: phrases,
      emotionalArtifacts: emotions,
      mascotArtifacts: mascots,
      symbolArtifacts: symbols,
      audioArtifacts: trend.type === "song" ? [trend.name, trend.artist].filter(Boolean) : [],
      behaviorArtifacts: behaviors,
      platformSignals: {
        captions: phrases,
        repeatedPhrases: phrases.slice(0, 2),
        soundTitles: trend.type === "song" ? [trend.name].filter(Boolean) : [],
        stitchedFormats: trend.videoCount >= 10000 ? ["mass_participation_format"] : [],
        reactionFormats: behaviors.includes("stare") || behaviors.includes("laugh") ? ["reaction_format"] : [],
        freezeFrameMoments: trend.type === "hashtag" && trend.totalViews >= 1000000 ? ["likely_freeze_frame"] : [],
        emotionalExpressions: emotions,
        editPatterns: trend.acceleration > 1.2 ? ["accelerating_edit_pattern"] : [],
      },
    };
  }

  extractX(post) {
    const text = `${post.name || ""} ${post.text || ""}`.trim();
    const phrases = extractPhrases(text);
    const emotions = extractEmotions(text);
    const mascots = extractMatches(text, MASCOT_WORDS);
    const symbols = extractMatches(text, SYMBOL_WORDS);
    const behaviors = extractMatches(text, BEHAVIOR_WORDS);

    return {
      visualArtifacts: post.hasMedia ? [`${post.mediaType || "media"} artifact`] : [],
      phraseArtifacts: phrases,
      emotionalArtifacts: emotions,
      mascotArtifacts: mascots,
      symbolArtifacts: symbols,
      audioArtifacts: [],
      behaviorArtifacts: behaviors,
      platformSignals: {
        quoteChains: post.quoteVelocity >= 25 || post.quoteExplosion ? ["active_quote_chain"] : [],
        screenshots: /screenshot|text|dm|message|caption/i.test(text) ? ["screenshot_discourse"] : [],
        symbolicImages: symbols,
        discourseFragments: phrases.slice(0, 3),
        recurringPhrases: phrases.slice(0, 2),
        crossCommunityPropagation: post.crossCommunitySpreadScore >= 120 ? ["cross_community"] : [],
      },
    };
  }
}

export function extractArtifacts(input) {
  return new CrossPlatformArtifactEngine().extract(input);
}

export function applyArtifactIntelligence(input) {
  if (!input) return input;
  const artifact = extractArtifacts(input);
  input.memeticArtifact = artifact;
  input.artifactStrength = artifact.artifactStrength;
  input.sourceArtifactType = artifact.artifactType;
  input.visualReuseMode = artifact.visualReuseMode;
  input.extractedPhrase = artifact.extractedPhrase;
  input.emotionalTexture = artifact.emotionalTexture;
  input.identityCompressionSummary = artifact.identityCompressionSummary;
  input.artifactSuggestedTicker = artifact.suggestedTicker;
  return input;
}

export function summarizeClusterArtifacts(cluster) {
  const artifacts = (cluster.relatedPosts || [])
    .map((post) => post.memeticArtifact)
    .filter(Boolean);
  if (artifacts.length === 0) return null;

  const strongest = artifacts.slice().sort((a, b) => b.artifactStrength - a.artifactStrength)[0];
  const avgStrength = Math.round(artifacts.reduce((sum, item) => sum + Number(item.artifactStrength || 0), 0) / artifacts.length);

  return {
    ...strongest,
    artifactStrength: Math.max(strongest.artifactStrength, avgStrength),
    clusterArtifactCount: artifacts.length,
    identityCompressionSummary: strongest.identityCompressionSummary,
  };
}

function scoreArtifact(artifact, input) {
  const hasVisual = artifact.visualArtifacts.length > 0 || input.hasMedia;
  const hasPhrase = artifact.phraseArtifacts.length > 0;
  const hasEmotion = artifact.emotionalArtifacts.length > 0;
  const hasMascot = artifact.mascotArtifacts.length > 0;
  const hasAudio = artifact.audioArtifacts.length > 0;
  const propagation = Number(input.quoteVelocity || 0) + Number(input.shareVelocity || 0) + Number(input.videoCount || 0) / 1000;

  const recognizability = clamp(25 + (hasPhrase ? 20 : 0) + (hasMascot ? 20 : 0) + (hasAudio ? 15 : 0), 0, 100);
  const remixability = clamp(20 + (hasVisual ? 20 : 0) + (hasPhrase ? 15 : 0) + Math.min(30, propagation / 8), 0, 100);
  const screenshotSurvivability = clamp(15 + (hasVisual ? 35 : 0) + (artifact.symbolArtifacts.length ? 20 : 0) + (hasPhrase ? 15 : 0), 0, 100);
  const emotionalCompression = clamp(20 + (hasEmotion ? 35 : 0) + (artifact.behaviorArtifacts.length ? 15 : 0), 0, 100);
  const visualUniqueness = clamp(20 + (hasMascot ? 25 : 0) + (artifact.symbolArtifacts.length ? 20 : 0) + (hasVisual ? 20 : 0), 0, 100);
  const repeatability = clamp(25 + (hasPhrase ? 25 : 0) + (artifact.behaviorArtifacts.length ? 20 : 0), 0, 100);
  const soundStickiness = clamp(hasAudio ? 70 : input.sourcePlatform === "tiktok" ? 35 : 10, 0, 100);

  const total = Math.round(
    recognizability * 0.18 +
    remixability * 0.18 +
    screenshotSurvivability * 0.14 +
    emotionalCompression * 0.14 +
    visualUniqueness * 0.14 +
    repeatability * 0.14 +
    soundStickiness * 0.08
  );

  return {
    recognizability,
    remixability,
    screenshotSurvivability,
    emotionalCompression,
    visualUniqueness,
    repeatability,
    soundStickiness,
    total,
  };
}

function compressIdentity(artifact, input, scores) {
  const mascotPhrase = getMascotPhrase(artifact.phraseArtifacts[0], artifact.mascotArtifacts[0]);
  const phrase = mascotPhrase || artifact.phraseArtifacts[0] || artifact.mascotArtifacts[0] || artifact.symbolArtifacts[0] || cleanText(input.name || "OINK Artifact");
  const emotion = artifact.emotionalArtifacts[0] || "internet curiosity";
  const visual = artifact.visualArtifacts[0] || artifact.symbolArtifacts[0] || artifact.mascotArtifacts[0] || "source artifact";
  const name = titleCase([phrase].filter(Boolean).join(" ").slice(0, 32) || "OINK Artifact");
  const ticker = buildArtifactTicker({ phrase, emotion, visual, artifact });

  return {
    name,
    ticker,
    launchFraming: `${name} compresses ${emotion} into a repeatable ${visual}.`,
    summary: `${artifactLabel(getPrimaryArtifactType(artifact))}: "${phrase}" + ${emotion} + ${visual}; artifact strength ${scores.total}/100.`,
  };
}

function buildArtifactTicker({ phrase, emotion, visual, artifact }) {
  const candidates = [
    getMascotPhrase(phrase, artifact.mascotArtifacts[0]),
    artifact.mascotArtifacts[0],
    artifact.symbolArtifacts[0],
    artifact.behaviorArtifacts[0],
    phrase,
    emotion,
    visual,
  ];
  for (const candidate of candidates) {
    const ticker = cleanWords(candidate).join("").toUpperCase().slice(0, 10);
    if (ticker.length >= 3 && !/^(THE|THIS|THAT|VIRAL|MEME|VIDEO|POST)$/.test(ticker)) return ticker;
  }
  return "OINK";
}

function getMascotPhrase(phrase = "", mascot = "") {
  if (!phrase || !mascot) return "";
  const words = cleanWords(phrase);
  const index = words.findIndex((word) => word.toLowerCase() === mascot.toLowerCase());
  if (index < 0) return "";
  const start = Math.max(0, index - 1);
  return words.slice(start, index + 1).join(" ");
}

function getPrimaryArtifactType(artifact) {
  if (artifact.mascotArtifacts.length) return "mascot_artifact";
  if (artifact.audioArtifacts.length) return "audio_artifact";
  if (artifact.emotionalArtifacts.length && artifact.visualArtifacts.length) return "emotional_artifact";
  if (artifact.visualArtifacts.length) return "visual_artifact";
  if (artifact.phraseArtifacts.length) return "phrase_artifact";
  if (artifact.symbolArtifacts.length) return "symbol_artifact";
  if (artifact.behaviorArtifacts.length) return "behavior_artifact";
  return "symbolic_artifact";
}

function getVisualReuseMode(artifact, input, scores) {
  if (artifact.audioArtifacts.length && !artifact.visualArtifacts.length) return "generate_new_image";
  if (artifact.mascotArtifacts.length || artifact.symbolArtifacts.length) return "isolate_symbol";
  if (input.hasMedia && scores.screenshotSurvivability >= 70) return "crop_source_media";
  if (input.hasMedia && artifact.phraseArtifacts.length) return "overlay_text";
  if (input.hasMedia) return "lightly_mutate_source_media";
  return "generate_new_image";
}

function getRecommendedAction(artifact, input, scores) {
  if (input.sourcePlatform === "tiktok" && scores.screenshotSurvivability >= 70) return "FREEZE_FRAME_EXTRACTION";
  if (artifact.audioArtifacts.length) return "SOUND_IDENTITY_CAPTURE";
  if (artifact.mascotArtifacts.length) return "MASCOT_ISOLATION";
  if (artifact.phraseArtifacts.length && input.hasMedia) return "TEXT_OVERLAY_VARIANT";
  return "IDENTITY_COMPRESSION";
}

function extractPhrases(text) {
  const cleaned = cleanText(text);
  const quoted = [...String(text || "").matchAll(/["“”']([^"“”']{3,48})["“”']/g)].map((match) => match[1]);
  const words = cleanWords(cleaned);
  const phrases = [...quoted];
  if (words.length >= 2) phrases.push(words.slice(0, Math.min(3, words.length)).join(" "));
  if (words.length === 1) phrases.push(words[0]);
  return [...new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 4);
}

function extractEmotions(text) {
  const lower = String(text || "").toLowerCase();
  const found = [];
  for (const [emotion, words] of Object.entries(EMOTION_WORDS)) {
    if (words.some((word) => lower.includes(word))) found.push(emotion);
  }
  return found.length ? found : inferEmotionFromPunctuation(text);
}

function inferEmotionFromPunctuation(text) {
  const value = String(text || "");
  if (/[!?]{2,}/.test(value)) return ["awe"];
  if (value === value.toUpperCase() && value.length > 12) return ["chaos"];
  return [];
}

function extractMatches(text, words) {
  const lower = ` ${String(text || "").toLowerCase()} `;
  return words.filter((word) => lower.includes(` ${word} `)).slice(0, 5);
}

function cleanWords(text = "") {
  return cleanText(text)
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 5);
}

function cleanText(text = "") {
  return String(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#]/g, " ")
    .replace(/[^a-z0-9\s'"!?]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artifactLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function titleCase(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function labelScore(score) {
  if (score >= 80) return "VERY HIGH";
  if (score >= 65) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
}
