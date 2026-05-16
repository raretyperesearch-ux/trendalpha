const ANIMAL_TERMS = [
  "cat", "dog", "bird", "duck", "goose", "squirrel", "bear", "frog", "monkey",
  "horse", "penguin", "shark", "fish", "hamster", "rat", "mouse",
];

const CHARACTER_TERMS = [
  "baby", "guy", "girl", "boy", "man", "woman", "kid", "mascot", "robot",
  "alien", "clown", "chef", "teacher", "boss", "king", "queen",
];

const OBJECT_TERMS = [
  "hat", "shoe", "car", "truck", "plane", "chair", "phone", "camera", "sign",
  "door", "bag", "cup", "ball", "cake", "pizza", "burger", "toy", "doll",
];

const SYMBOL_TERMS = [
  "moon", "sun", "star", "heart", "fire", "rainbow", "flag", "crown", "mask",
  "eyes", "hand", "face", "smile",
];

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "from", "have", "they", "what", "when",
  "where", "just", "like", "will", "your", "their", "about", "there", "been",
  "into", "after", "before", "over", "under", "video", "clip", "photo",
]);

export function applyLaunchWorthiness(post, token = null) {
  if (!post || post.sourcePlatform !== "x") return post;
  const worthiness = computeLaunchWorthiness(post, { token });
  Object.assign(post, worthiness);
  return post;
}

export function computeLaunchWorthiness(post, { token = null } = {}) {
  const rawText = `${post.name || ""} ${post.text || ""}`;
  const text = cleanText(rawText);
  const words = text.split(/\s+/).filter(Boolean);
  const entities = extractMarketEntities(rawText);
  const marketArchetype = classifyMarketArchetype({ post, text, words, entities });
  const narrativeHalfLifeEstimate = estimateNarrativeHalfLife({ post, marketArchetype });

  const narrativeClarity = scoreNarrativeClarity({ words, entities, marketArchetype });
  const repeatability = scoreRepeatability({ words, post });
  const remixability = scoreRemixability(post);
  const mascotPresence = scoreMascotPresence({ entities, marketArchetype, post });
  const symbolicDensity = scoreSymbolicDensity({ entities, words, post });
  const phraseStickiness = scorePhraseStickiness({ words, post });
  const identityFormationPotential = scoreIdentityFormation({ post, marketArchetype, entities });
  const crossCommunityPersistence = scoreCrossCommunityPersistence(post);
  const propagationPersistence = scorePropagationPersistence(post);
  const memeMutationPotential = scoreMemeMutationPotential({ post, words, marketArchetype });

  const breakdown = {
    narrativeClarity,
    repeatability,
    remixability,
    mascotPresence,
    symbolicDensity,
    phraseStickiness,
    identityFormationPotential,
    crossCommunityPersistence,
    propagationPersistence,
    memeMutationPotential,
  };

  let launchWorthinessScore = Math.round(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const copycatSwarm = Boolean(post.copycatSwarm);
  const hasCanonicalMarket = token?.matchStatus === "canonical" || post.marketMatchStatus === "canonical";
  const hasPossibleMarket = token?.matchStatus === "possible" || post.marketMatchStatus === "possible";

  if (copycatSwarm) launchWorthinessScore -= 18;
  if (hasCanonicalMarket) launchWorthinessScore -= 14;
  else if (hasPossibleMarket) launchWorthinessScore -= 6;
  else if (isUnclaimedAttention(post)) launchWorthinessScore += 10;

  launchWorthinessScore = clamp(launchWorthinessScore, 0, 100);

  const communityFormationScore = getCommunityFormationScore({
    post,
    remixability,
    identityFormationPotential,
    crossCommunityPersistence,
  });
  const recommendation = getLaunchRecommendation({ launchWorthinessScore, post, copycatSwarm, hasCanonicalMarket });

  return {
    launchWorthinessScore,
    launchWorthinessBreakdown: breakdown,
    launchRecommendation: recommendation,
    marketArchetype,
    narrativeHalfLifeEstimate,
    communityFormationScore,
    communityFormationLabel: labelStrength(communityFormationScore),
    remixabilityLabel: labelStrength(remixability),
    mascotEntities: entities,
    copycatSwarm,
    unclaimedAttention: !hasCanonicalMarket && !copycatSwarm,
  };
}

function classifyMarketArchetype({ post, text, words, entities }) {
  if (entities.animals.length > 0 || entities.characters.length > 0) return "mascot";
  if (entities.celebrities.length > 0 || /\b(singer|actor|actress|rapper|streamer|creator|influencer|celebrity)\b/i.test(text)) return "personality";
  if (post.viralShape === "likely_bot_amplified" || post.saturationRisk >= 70) return "anti-meme";
  if (post.viralShape === "cross_community" && post.propagationRatio >= 0.18) return "movement";
  if (post.quoteExplosion && words.length <= 8) return "phrase";
  if (entities.objects.length > 0 && post.hasMedia) return "collectible";
  if (entities.symbols.length > 0) return "aesthetic";
  if (/\b(i am|we are|team|army|club|nation|people)\b/i.test(text)) return "identity";
  if (/\b(event|show|concert|game|finale|award|launch)\b/i.test(text)) return "event";
  if (post.quoteVelocity >= 25 && post.replyRate >= 0.02) return "reaction";
  if (post.propagationRatio >= 0.3 && post.crossCommunitySpreadScore >= 150) return "chaos";
  if (post.momentumTrend === "rising" || post.momentumTrend === "reigniting") return "trendwave";
  return "aesthetic";
}

function estimateNarrativeHalfLife({ post, marketArchetype }) {
  if (post.copycatSwarm || post.viralShape === "saturated" || post.viralShape === "low_conversion") return "flash trend";
  if (post.momentumTrend === "reigniting" || marketArchetype === "identity" || marketArchetype === "mascot") {
    return "persistent identity candidate";
  }
  if (
    post.momentumTrend === "rising" ||
    post.quoteAcceleration >= 3 ||
    post.repostAcceleration >= 3 ||
    post.crossCommunitySpreadScore >= 150
  ) {
    return "medium-cycle narrative";
  }
  if (post.quoteExplosion || post.propagationRatio >= 0.12) return "short-cycle meme";
  return "flash trend";
}

function extractMarketEntities(text) {
  return {
    animals: findTerms(text, ANIMAL_TERMS),
    characters: findTerms(text, CHARACTER_TERMS),
    objects: findTerms(text, OBJECT_TERMS),
    symbols: findTerms(text, SYMBOL_TERMS),
    celebrities: extractProperNameEntities(text),
    uniquePhrases: extractUniquePhrases(text),
  };
}

function scoreNarrativeClarity({ words, entities, marketArchetype }) {
  let score = 2;
  if (words.length >= 2 && words.length <= 10) score += 3;
  if (entities.uniquePhrases.length > 0) score += 2;
  if (["mascot", "phrase", "identity", "collectible"].includes(marketArchetype)) score += 3;
  return clamp(score, 0, 10);
}

function scoreRepeatability({ words, post }) {
  let score = 1;
  if (words.length > 0 && words.length <= 6) score += 4;
  else if (words.length <= 10) score += 2;
  if (post.quoteExplosion) score += 2;
  if (post.propagationRatio >= 0.12) score += 2;
  return clamp(score, 0, 10);
}

function scoreRemixability(post) {
  let score = 1;
  if (post.hasMedia) score += 2;
  if (post.quoteExplosion) score += 3;
  if (post.quoteVelocity >= 25) score += 2;
  if (post.crossCommunitySpreadScore >= 150) score += 2;
  if (post.viralShape === "likely_bot_amplified") score -= 3;
  return clamp(score, 0, 10);
}

function scoreMascotPresence({ entities, marketArchetype, post }) {
  let score = 0;
  if (entities.animals.length > 0) score += 5;
  if (entities.characters.length > 0) score += 3;
  if (entities.objects.length > 0) score += 2;
  if (marketArchetype === "mascot") score += 2;
  if (post.hasMedia) score += 1;
  return clamp(score, 0, 10);
}

function scoreSymbolicDensity({ entities, words, post }) {
  let score = 1;
  const entityCount = entities.animals.length + entities.characters.length + entities.objects.length + entities.symbols.length + entities.celebrities.length;
  score += Math.min(5, entityCount * 2);
  if (words.length <= 8) score += 2;
  if (post.hasMedia) score += 2;
  return clamp(score, 0, 10);
}

function scorePhraseStickiness({ words, post }) {
  let score = 1;
  if (words.length >= 2 && words.length <= 5) score += 4;
  if (words.some((word) => word.length >= 5 && !STOP_WORDS.has(word))) score += 2;
  if (post.quoteToLikeRate >= 0.08) score += 2;
  if (post.replyRate >= 0.02) score += 1;
  return clamp(score, 0, 10);
}

function scoreIdentityFormation({ post, marketArchetype, entities }) {
  let score = 1;
  if (["identity", "mascot", "movement", "collectible"].includes(marketArchetype)) score += 4;
  if (post.engagementToFollowerRate >= 0.03) score += 2;
  if (entities.animals.length > 0 || entities.characters.length > 0 || entities.celebrities.length > 0) score += 2;
  if (post.copycatSwarm) score -= 3;
  return clamp(score, 0, 10);
}

function scoreCrossCommunityPersistence(post) {
  let score = 1;
  if (post.crossCommunitySpreadScore >= 250) score += 5;
  else if (post.crossCommunitySpreadScore >= 150) score += 3;
  if (post.quoteVelocity >= 25) score += 2;
  if (post.repostVelocity >= 75) score += 2;
  return clamp(score, 0, 10);
}

function scorePropagationPersistence(post) {
  let score = 1;
  if (post.momentumTrend === "reigniting") score += 5;
  else if (post.momentumTrend === "rising") score += 4;
  else if (post.momentumTrend === "stable") score += 2;
  if (post.quoteVelocityDelta > 0) score += 2;
  if (post.shareVelocityDelta > 0) score += 1;
  if (post.momentumTrend === "decaying") score -= 3;
  return clamp(score, 0, 10);
}

function scoreMemeMutationPotential({ post, words, marketArchetype }) {
  let score = 1;
  if (post.quoteExplosion) score += 3;
  if (post.quoteAcceleration >= 3) score += 2;
  if (["phrase", "reaction", "chaos", "mascot"].includes(marketArchetype)) score += 2;
  if (words.length <= 8) score += 1;
  if (post.copycatSwarm) score -= 2;
  return clamp(score, 0, 10);
}

function getCommunityFormationScore({ post, remixability, identityFormationPotential, crossCommunityPersistence }) {
  return clamp(
    Math.round(
      remixability * 0.3 +
      identityFormationPotential * 0.35 +
      crossCommunityPersistence * 0.25 +
      (post.engagementToFollowerRate >= 0.03 ? 1 : 0)
    ),
    0,
    10
  );
}

function getLaunchRecommendation({ launchWorthinessScore, post, copycatSwarm, hasCanonicalMarket }) {
  if (copycatSwarm || hasCanonicalMarket || post.viralShape === "likely_bot_amplified" || post.saturationRisk >= 75) {
    return "DO_NOT_LAUNCH";
  }
  if (launchWorthinessScore >= 88 && (post.momentumTrend === "rising" || post.momentumTrend === "reigniting")) {
    return "BREAKOUT_FORMING";
  }
  if (launchWorthinessScore >= 78) return "HIGH_CONVICTION";
  if (launchWorthinessScore >= 62) return "EARLY_OPPORTUNITY";
  if (launchWorthinessScore >= 45) return "WATCH";
  return "DO_NOT_LAUNCH";
}

function isUnclaimedAttention(post) {
  return (
    (post.attentionMomentum >= 25_000 || post.attentionShapeScore >= 25_000 || post.quoteExplosion) &&
    post.marketMatchStatus !== "canonical" &&
    !post.copycatSwarm
  );
}

function findTerms(text, terms) {
  const set = new Set();
  for (const term of terms) {
    if (new RegExp(`\\b${escapeRegExp(term)}s?\\b`, "i").test(text)) set.add(term);
  }
  return [...set];
}

function extractUniquePhrases(text) {
  const words = cleanText(text).split(/\s+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  const phrases = [];
  for (let size = 2; size <= 4; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      phrases.push(words.slice(i, i + size).join(" "));
    }
  }
  return [...new Set(phrases)].slice(0, 8);
}

function extractProperNameEntities(text = "") {
  const matches = String(text).match(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,3}\b/g) || [];
  return [...new Set(matches.map(cleanText).filter((name) => name.split(/\s+/).length >= 2))].slice(0, 6);
}

function cleanText(text = "") {
  return String(text)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/#(\w+)/g, "$1")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function labelStrength(score) {
  if (score >= 8) return "HIGH";
  if (score >= 6) return "STRONG";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
