import { evaluateNarrativePhase } from "./narrativePhase.js";

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "from", "have", "they", "what", "when",
  "where", "just", "like", "will", "your", "their", "about", "there", "been",
  "into", "after", "before", "over", "under", "video", "clip", "photo",
  "picture", "moment", "watch", "look", "people", "someone", "today", "here",
]);

const GENERIC_ENTITIES = new Set([
  "viral", "trending", "meme", "video", "photo", "clip", "post", "x",
  "twitter", "internet", "media", "thing", "people", "someone",
]);

export class NarrativeCluster {
  constructor(fields = {}) {
    this.clusterId = fields.clusterId || "";
    this.canonicalEntity = fields.canonicalEntity || "Unknown Narrative";
    this.aliases = fields.aliases || [];
    this.archetype = fields.archetype || "trendwave";
    this.firstSeenAt = fields.firstSeenAt || new Date().toISOString();
    this.lastSeenAt = fields.lastSeenAt || new Date().toISOString();
    this.totalAttention = fields.totalAttention || 0;
    this.totalMomentum = fields.totalMomentum || 0;
    this.propagationPersistence = fields.propagationPersistence || 0;
    this.communitySpreadScore = fields.communitySpreadScore || 0;
    this.relatedPosts = fields.relatedPosts || [];
    this.relatedAccounts = fields.relatedAccounts || [];
    this.relatedPhrases = fields.relatedPhrases || [];
    this.remixCount = fields.remixCount || 0;
    this.marketStatus = fields.marketStatus || "unclaimed";
    this.lifecycleState = fields.lifecycleState || "emerging";
    this.momentumTrend = fields.momentumTrend || "stable";
    this.launchWorthinessScore = fields.launchWorthinessScore || 0;
    this.recommendation = fields.recommendation || "WATCH";
    this.copycatSwarm = Boolean(fields.copycatSwarm);
    this.swarmPollutionScore = fields.swarmPollutionScore || 0;
    this.quoteExplosion = Boolean(fields.quoteExplosion);
    this.attentionMomentumDelta = fields.attentionMomentumDelta || 0;
    this.shareVelocityDelta = fields.shareVelocityDelta || 0;
    this.quoteVelocityDelta = fields.quoteVelocityDelta || 0;
    this.accelerationDelta = fields.accelerationDelta || 0;
    this.viralShapeReason = fields.viralShapeReason || "";
    this.saturationPressure = fields.saturationPressure || 0;
    this.launchReadiness = fields.launchReadiness || 0;
    this.phaseRecommendation = fields.phaseRecommendation || fields.recommendation || "WATCH";
    this.crossCommunityTrend = fields.crossCommunityTrend || "LOW";
    this.swarmPressure = fields.swarmPressure || 0;
    this.launchWindow = fields.launchWindow || "WATCH";
    this.idealLaunchTiming = fields.idealLaunchTiming || "watch";
    this.accelerationSlope = fields.accelerationSlope || 0;
    this.momentumPersistence = fields.momentumPersistence || 0;
    this.quoteChainExpansion = fields.quoteChainExpansion || 0;
    this.propagationHalfLife = fields.propagationHalfLife || "short";
    this.remixGrowthRate = fields.remixGrowthRate || 0;
    this.adaptiveLaunchThreshold = fields.adaptiveLaunchThreshold || 78;
    this.crossCommunityBreakoutTiming = fields.crossCommunityBreakoutTiming || "none";
    this.accelerationInflectionPoint = fields.accelerationInflectionPoint || "stable";
    this.missedWindow = Boolean(fields.missedWindow);
    this.earlyConviction = Boolean(fields.earlyConviction);
  }
}

export function buildNarrativeClusters(posts = [], previousSnapshots = []) {
  const xPosts = posts.filter((post) => post?.sourcePlatform === "x");
  if (xPosts.length === 0) return [];

  const previousById = indexPreviousClusters(previousSnapshots);
  const provisional = [];

  for (const post of xPosts) {
    const signals = extractNarrativeSignals(post);
    if (signals.entities.length === 0 && signals.phrases.length === 0) continue;

    const match = provisional.find((cluster) => shouldJoinCluster(cluster, post, signals));
    if (match) {
      addPostToCluster(match, post, signals);
    } else {
      provisional.push(createClusterSeed(post, signals));
    }
  }

  const clusters = mergeRelatedClusters(provisional)
    .map((cluster) => finalizeCluster(cluster, previousById))
    .sort((a, b) => b.launchWorthinessScore - a.launchWorthinessScore);

  for (const cluster of clusters) {
    logCluster(cluster);
  }

  return clusters;
}

export function getStrongNarrativeClusters(clusters = []) {
  return clusters.filter((cluster) => {
    if (cluster.copycatSwarm && cluster.launchWorthinessScore < 86) return false;
    if (cluster.lifecycleState === "saturated" || cluster.lifecycleState === "decaying") return false;
    if (cluster.launchWindow === "SATURATED" || cluster.launchWindow === "LATE_STAGE") return false;
    if (cluster.lifecycleState === "reigniting") return cluster.launchReadiness >= 68;
    if (cluster.launchWindow === "PRIME_WINDOW") return cluster.launchReadiness >= 72;
    if (cluster.launchWindow === "FORMING_WINDOW") return cluster.launchReadiness >= 70;
    if (["forming", "accelerating", "breakout"].includes(cluster.lifecycleState)) return cluster.launchReadiness >= 72;
    return cluster.launchReadiness >= 82;
  });
}

export function serializeNarrativeCluster(cluster) {
  return {
    clusterId: cluster.clusterId,
    canonicalEntity: cluster.canonicalEntity,
    aliases: cluster.aliases,
    archetype: cluster.archetype,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    totalAttention: cluster.totalAttention,
    totalMomentum: cluster.totalMomentum,
    propagationPersistence: cluster.propagationPersistence,
    communitySpreadScore: cluster.communitySpreadScore,
    relatedPosts: cluster.relatedPosts,
    relatedAccounts: cluster.relatedAccounts,
    relatedPhrases: cluster.relatedPhrases,
    remixCount: cluster.remixCount,
    marketStatus: cluster.marketStatus,
    lifecycleState: cluster.lifecycleState,
    momentumTrend: cluster.momentumTrend,
    launchWorthinessScore: cluster.launchWorthinessScore,
    recommendation: cluster.recommendation,
    copycatSwarm: cluster.copycatSwarm,
    swarmPollutionScore: cluster.swarmPollutionScore,
    quoteExplosion: cluster.quoteExplosion,
    attentionMomentumDelta: cluster.attentionMomentumDelta,
    shareVelocityDelta: cluster.shareVelocityDelta,
    quoteVelocityDelta: cluster.quoteVelocityDelta,
    accelerationDelta: cluster.accelerationDelta,
    saturationPressure: cluster.saturationPressure,
    launchReadiness: cluster.launchReadiness,
    phaseRecommendation: cluster.phaseRecommendation,
    crossCommunityTrend: cluster.crossCommunityTrend,
    swarmPressure: cluster.swarmPressure,
    launchWindow: cluster.launchWindow,
    idealLaunchTiming: cluster.idealLaunchTiming,
    accelerationSlope: cluster.accelerationSlope,
    momentumPersistence: cluster.momentumPersistence,
    quoteChainExpansion: cluster.quoteChainExpansion,
    propagationHalfLife: cluster.propagationHalfLife,
    remixGrowthRate: cluster.remixGrowthRate,
    adaptiveLaunchThreshold: cluster.adaptiveLaunchThreshold,
    crossCommunityBreakoutTiming: cluster.crossCommunityBreakoutTiming,
    accelerationInflectionPoint: cluster.accelerationInflectionPoint,
    missedWindow: cluster.missedWindow,
    earlyConviction: cluster.earlyConviction,
  };
}

function createClusterSeed(post, signals) {
  const canonicalEntity = chooseCanonicalEntity(signals, post);
  const cluster = new NarrativeCluster({
    clusterId: `cluster-${slugify(canonicalEntity)}`,
    canonicalEntity,
    archetype: post.marketArchetype || "trendwave",
    firstSeenAt: post.discoveredAt || new Date().toISOString(),
    lastSeenAt: post.discoveredAt || new Date().toISOString(),
  });
  cluster._entities = new Set(signals.entities);
  cluster._phrases = new Set(signals.phrases);
  cluster._accounts = new Set();
  cluster._mediaMotifs = new Set(signals.mediaMotifs);
  addPostToCluster(cluster, post, signals);
  return cluster;
}

function addPostToCluster(cluster, post, signals) {
  for (const entity of signals.entities) cluster._entities.add(entity);
  for (const phrase of signals.phrases) cluster._phrases.add(phrase);
  for (const motif of signals.mediaMotifs) cluster._mediaMotifs.add(motif);
  if (post.author && post.author !== "unknown") cluster._accounts.add(post.author);

  cluster.relatedPosts.push({
    id: post.id,
    name: post.name,
    sourceUrl: post.sourceUrl,
    author: post.author,
    totalViews: Number(post.totalViews || 0),
    attentionMomentum: Number(post.attentionMomentum || 0),
    shareVelocity: Number(post.shareVelocity || 0),
    quoteVelocity: Number(post.quoteVelocity || 0),
    repostVelocity: Number(post.repostVelocity || 0),
    quoteExplosion: Boolean(post.quoteExplosion),
    viralShape: post.viralShape || "compounding",
    marketArchetype: post.marketArchetype || "trendwave",
    launchWorthinessScore: Number(post.launchWorthinessScore || 0),
  });

  cluster.totalAttention += Number(post.totalViews || 0);
  cluster.totalMomentum += Number(post.attentionMomentum || post.attentionShapeScore || 0);
  cluster.communitySpreadScore += Number(post.crossCommunitySpreadScore || 0);
  cluster.remixCount += estimateRemixCount(post);
  cluster.copycatSwarm = cluster.copycatSwarm || Boolean(post.copycatSwarm);
  cluster.swarmPollutionScore += getSwarmPollutionScore(post);
  cluster.quoteExplosion = cluster.quoteExplosion || Boolean(post.quoteExplosion);
  cluster.marketStatus = getClusterMarketStatus(cluster.marketStatus, post);
  cluster.lastSeenAt = maxIso(cluster.lastSeenAt, post.discoveredAt || new Date().toISOString());
  cluster.firstSeenAt = minIso(cluster.firstSeenAt, post.discoveredAt || new Date().toISOString());
}

function finalizeCluster(cluster, previousById) {
  cluster.aliases = [...cluster._entities].filter((entity) => entity !== cluster.canonicalEntity).slice(0, 12);
  cluster.relatedAccounts = [...cluster._accounts].slice(0, 20);
  cluster.relatedPhrases = [...cluster._phrases].slice(0, 20);
  cluster.communitySpreadScore = Math.round(cluster.communitySpreadScore / Math.max(1, cluster.relatedPosts.length));
  cluster.propagationPersistence = getPropagationPersistence(cluster);

  const previous = previousById.get(cluster.clusterId) || findPreviousByAlias(cluster, previousById);
  applyClusterPersistence(cluster, previous);

  cluster.lifecycleState = classifyLifecycle(cluster, previous);
  cluster.momentumTrend = classifyClusterMomentum(cluster, previous);
  cluster.archetype = chooseClusterArchetype(cluster);
  cluster.launchWorthinessScore = scoreClusterLaunchWorthiness(cluster);
  const phase = evaluateNarrativePhase({
    ...cluster,
    lifecycleState: cluster.lifecycleState,
    marketStatus: cluster.marketStatus,
  });
  cluster.lifecycleState = phase.narrativePhase;
  cluster.momentumTrend = phase.momentumState.toLowerCase();
  cluster.saturationPressure = phase.saturationPressure;
  cluster.launchReadiness = phase.launchReadiness;
  cluster.phaseRecommendation = phase.phaseRecommendation;
  cluster.crossCommunityTrend = phase.crossCommunityTrend;
  cluster.swarmPressure = phase.swarmPressure;
  cluster.launchWindow = phase.launchWindow;
  cluster.idealLaunchTiming = phase.idealLaunchTiming;
  cluster.accelerationSlope = phase.accelerationSlope;
  cluster.momentumPersistence = phase.momentumPersistence;
  cluster.quoteChainExpansion = phase.quoteChainExpansion;
  cluster.propagationHalfLife = phase.propagationHalfLife;
  cluster.remixGrowthRate = phase.remixGrowthRate;
  cluster.adaptiveLaunchThreshold = phase.adaptiveLaunchThreshold;
  cluster.crossCommunityBreakoutTiming = phase.crossCommunityBreakoutTiming;
  cluster.accelerationInflectionPoint = phase.accelerationInflectionPoint;
  cluster.missedWindow = phase.missedWindow;
  cluster.earlyConviction = phase.earlyConviction;
  cluster.recommendation = getClusterRecommendation(cluster);
  cluster.viralShapeReason = getClusterReason(cluster);

  delete cluster._entities;
  delete cluster._phrases;
  delete cluster._accounts;
  delete cluster._mediaMotifs;

  return cluster;
}

function extractNarrativeSignals(post) {
  const text = `${post.name || ""} ${post.text || ""}`;
  const cleaned = cleanText(text);
  const words = cleaned.split(/\s+/).filter((word) => word && !STOP_WORDS.has(word));
  const properEntities = extractProperEntities(text);
  const hashtagEntities = extractHashtags(text);
  const mascotEntities = extractMascotEntities(cleaned);
  const phrases = extractPhrases(words);
  const entities = unique([
    ...properEntities,
    ...hashtagEntities,
    ...mascotEntities,
    ...phrases.slice(0, 2),
  ]).filter((entity) => !GENERIC_ENTITIES.has(entity.toLowerCase()));

  const mediaMotifs = [];
  if (post.mediaType) mediaMotifs.push(`media:${post.mediaType}`);
  if (post.hasMedia && mascotEntities[0]) mediaMotifs.push(`visual:${mascotEntities[0]}`);
  if (post.hasMedia && phrases[0]) mediaMotifs.push(`visual:${phrases[0]}`);

  return {
    entities: entities.slice(0, 10),
    phrases: phrases.slice(0, 12),
    mediaMotifs,
  };
}

function shouldJoinCluster(cluster, post, signals) {
  const entityOverlap = overlapCount(cluster._entities, signals.entities);
  const phraseOverlap = overlapCount(cluster._phrases, signals.phrases);
  const motifOverlap = overlapCount(cluster._mediaMotifs, signals.mediaMotifs);
  const accountOverlap = post.author && cluster._accounts.has(post.author) ? 1 : 0;
  const semantic = jaccard([...cluster._phrases], signals.phrases);

  return (
    entityOverlap >= 1 ||
    phraseOverlap >= 2 ||
    motifOverlap >= 1 ||
    (accountOverlap && phraseOverlap >= 1) ||
    semantic >= 0.34
  );
}

function mergeRelatedClusters(clusters) {
  const merged = [];
  for (const cluster of clusters) {
    const target = merged.find((candidate) => clustersShouldMerge(candidate, cluster));
    if (!target) {
      merged.push(cluster);
      continue;
    }
    mergeClusterInto(target, cluster);
  }
  return merged;
}

function clustersShouldMerge(a, b) {
  return (
    overlapCount(a._entities, [...b._entities]) >= 1 ||
    overlapCount(a._phrases, [...b._phrases]) >= 3 ||
    overlapCount(a._mediaMotifs, [...b._mediaMotifs]) >= 1 ||
    jaccard([...a._phrases], [...b._phrases]) >= 0.4
  );
}

function mergeClusterInto(target, source) {
  for (const entity of source._entities) target._entities.add(entity);
  for (const phrase of source._phrases) target._phrases.add(phrase);
  for (const account of source._accounts) target._accounts.add(account);
  for (const motif of source._mediaMotifs) target._mediaMotifs.add(motif);

  target.relatedPosts.push(...source.relatedPosts);
  target.totalAttention += source.totalAttention;
  target.totalMomentum += source.totalMomentum;
  target.communitySpreadScore += source.communitySpreadScore;
  target.remixCount += source.remixCount;
  target.copycatSwarm = target.copycatSwarm || source.copycatSwarm;
  target.swarmPollutionScore += source.swarmPollutionScore;
  target.quoteExplosion = target.quoteExplosion || source.quoteExplosion;
  target.marketStatus = getClusterMarketStatus(target.marketStatus, { marketMatchStatus: source.marketStatus });
  target.firstSeenAt = minIso(target.firstSeenAt, source.firstSeenAt);
  target.lastSeenAt = maxIso(target.lastSeenAt, source.lastSeenAt);
}

function applyClusterPersistence(cluster, previous) {
  if (!previous) return;
  cluster.firstSeenAt = minIso(cluster.firstSeenAt, previous.firstSeenAt || previous.first_seen_at);
  cluster.attentionMomentumDelta = cluster.totalMomentum - Number(previous.totalMomentum || previous.total_momentum || 0);
  cluster.shareVelocityDelta = average(cluster.relatedPosts.map((post) => post.shareVelocity)) - Number(previous.avgShareVelocity || previous.avg_share_velocity || 0);
  cluster.quoteVelocityDelta = average(cluster.relatedPosts.map((post) => post.quoteVelocity)) - Number(previous.avgQuoteVelocity || previous.avg_quote_velocity || 0);
  cluster.accelerationDelta = cluster.propagationPersistence - Number(previous.propagationPersistence || previous.propagation_persistence || 0);
}

function classifyLifecycle(cluster, previous) {
  const postCount = cluster.relatedPosts.length;
  const avgMomentum = cluster.totalMomentum / Math.max(1, postCount);
  const previousMomentum = Number(previous?.totalMomentum || previous?.total_momentum || 0);
  const wasDormant = previous && hoursSince(previous.lastSeenAt || previous.last_seen_at) >= 18;

  if (wasDormant && cluster.attentionMomentumDelta > Math.max(10_000, previousMomentum * 0.35)) return "reigniting";
  if (cluster.copycatSwarm && cluster.swarmPollutionScore >= 30) return "saturated";
  if (cluster.attentionMomentumDelta < -Math.max(10_000, previousMomentum * 0.3)) return "decaying";
  if (postCount >= 3 && cluster.propagationPersistence >= 72) return "compounding";
  if (avgMomentum >= 75_000 || cluster.quoteExplosion || cluster.attentionMomentumDelta > 25_000) return "accelerating";
  if (previous && hoursSince(cluster.lastSeenAt) > 36) return "dormant";
  if (cluster.swarmPollutionScore >= 18 || cluster.marketStatus === "canonical") return "peaking";
  return "emerging";
}

function classifyClusterMomentum(cluster, previous) {
  if (cluster.lifecycleState === "reigniting") return "reigniting";
  if (!previous) return cluster.quoteExplosion || cluster.relatedPosts.length > 1 ? "rising" : "stable";
  if (cluster.attentionMomentumDelta > 0 || cluster.quoteVelocityDelta > 0 || cluster.shareVelocityDelta > 0) return "rising";
  if (cluster.attentionMomentumDelta < -10_000 && cluster.quoteVelocityDelta <= 0 && cluster.shareVelocityDelta <= 0) return "decaying";
  return "stable";
}

function scoreClusterLaunchWorthiness(cluster) {
  const postScores = cluster.relatedPosts
    .map((post) => Number(post.launchWorthinessScore || 0))
    .filter(Boolean);
  const avgPostScore = postScores.length ? average(postScores) : 52;
  let score =
    avgPostScore * 0.35 +
    Math.min(22, cluster.relatedPosts.length * 5) +
    Math.min(16, cluster.relatedAccounts.length * 3) +
    Math.min(14, cluster.remixCount / 3) +
    Math.min(18, cluster.propagationPersistence / 5) +
    Math.min(12, cluster.communitySpreadScore / 16);

  if (cluster.lifecycleState === "reigniting") score += 14;
  if (cluster.lifecycleState === "compounding") score += 10;
  if (cluster.quoteExplosion) score += 6;
  if (cluster.marketStatus === "unclaimed") score += 8;
  if (cluster.copycatSwarm) score -= 18;
  if (cluster.marketStatus === "canonical") score -= 12;
  if (cluster.lifecycleState === "decaying" || cluster.lifecycleState === "dormant") score -= 18;

  return clamp(Math.round(score), 0, 100);
}

function getClusterRecommendation(cluster) {
  if (cluster.copycatSwarm || cluster.lifecycleState === "saturated" || cluster.marketStatus === "canonical") return "DO_NOT_LAUNCH";
  if (cluster.phaseRecommendation) return cluster.phaseRecommendation;
  if (cluster.launchReadiness >= 82 && ["reigniting", "breakout", "accelerating"].includes(cluster.lifecycleState)) return "HIGH_CONVICTION";
  if (cluster.launchReadiness >= 75) return "PREPARE_LAUNCH";
  if (cluster.launchReadiness >= 62) return "WATCH";
  if (cluster.launchWorthinessScore >= 45) return "WATCH";
  return "DO_NOT_LAUNCH";
}

function getPropagationPersistence(cluster) {
  const postCountScore = Math.min(28, cluster.relatedPosts.length * 7);
  const accountScore = Math.min(22, cluster.relatedAccounts.length * 5);
  const quoteScore = Math.min(22, average(cluster.relatedPosts.map((post) => post.quoteVelocity)) * 0.8);
  const shareScore = Math.min(18, average(cluster.relatedPosts.map((post) => post.shareVelocity)) * 0.25);
  const remixScore = Math.min(10, cluster.remixCount / 4);
  return clamp(Math.round(postCountScore + accountScore + quoteScore + shareScore + remixScore), 0, 100);
}

function chooseClusterArchetype(cluster) {
  const archetypes = new Map();
  for (const post of cluster.relatedPosts) {
    if (!post.marketArchetype) continue;
    archetypes.set(post.marketArchetype, (archetypes.get(post.marketArchetype) || 0) + 1);
  }
  if (cluster.relatedPhrases.some((phrase) => phrase.split(/\s+/).length <= 3)) return "phrase";
  if (cluster.communitySpreadScore >= 150) return "movement";
  if (cluster.quoteExplosion) return "reaction";
  const top = [...archetypes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) return top[0];
  return cluster.archetype || "trendwave";
}

function getClusterReason(cluster) {
  if (cluster.lifecycleState === "reigniting") return "Previously quiet narrative is accelerating again.";
  if (cluster.lifecycleState === "compounding") return "Multiple posts and accounts are reinforcing the same narrative.";
  if (cluster.quoteExplosion) return "Quote chains are increasing remix pressure around the narrative.";
  if (cluster.copycatSwarm) return "Copycat swarm pollution is diluting market ownership.";
  return "Related posts share entities, phrases, media motifs, or account propagation.";
}

function getClusterMarketStatus(current, post) {
  const status = post.marketMatchStatus || post.matchStatus || current || "unclaimed";
  if (status === "canonical" || current === "canonical") return "canonical";
  if (status === "possible" || current === "possible") return "possible";
  return "unclaimed";
}

function getSwarmPollutionScore(post) {
  let score = 0;
  if (post.copycatSwarm) score += 18;
  if (post.marketMatchCandidates?.length >= 3) score += Math.min(20, post.marketMatchCandidates.length * 4);
  if (post.cryptoSaturatedLanguage) score += 8;
  return score;
}

function estimateRemixCount(post) {
  return Math.round(
    Number(post.quoteCount || 0) * 0.6 +
    Number(post.replyCount || 0) * 0.08 +
    Number(post.repostCount || 0) * 0.04 +
    (post.quoteExplosion ? 8 : 0)
  );
}

function chooseCanonicalEntity(signals, post) {
  return (
    signals.entities.find((entity) => entity.split(/\s+/).length >= 2) ||
    signals.entities[0] ||
    signals.phrases[0] ||
    post.name ||
    "Unknown Narrative"
  );
}

function indexPreviousClusters(previousSnapshots = []) {
  const map = new Map();
  for (const item of previousSnapshots) {
    const snapshot = item.snapshot || item;
    const clusterId = snapshot.clusterId || item.clusterId || item.cluster_id;
    if (!clusterId) continue;
    const relatedPosts = snapshot.relatedPosts || [];
    map.set(clusterId, {
      ...snapshot,
      clusterId,
      firstSeenAt: snapshot.firstSeenAt || item.first_seen_at,
      lastSeenAt: snapshot.lastSeenAt || item.last_seen_at || item.scanned_at || item.timestamp,
      totalMomentum: snapshot.totalMomentum ?? item.total_momentum ?? 0,
      propagationPersistence: snapshot.propagationPersistence ?? item.propagation_persistence ?? item.persistenceScore,
      avgShareVelocity: snapshot.avgShareVelocity ?? item.avg_share_velocity ?? average(relatedPosts.map((post) => post.shareVelocity)),
      avgQuoteVelocity: snapshot.avgQuoteVelocity ?? item.avg_quote_velocity ?? average(relatedPosts.map((post) => post.quoteVelocity)),
    });
  }
  return map;
}

function findPreviousByAlias(cluster, previousById) {
  const slugAliases = new Set([cluster.clusterId, ...cluster.aliases.map((alias) => `cluster-${slugify(alias)}`)]);
  for (const previous of previousById.values()) {
    if (slugAliases.has(previous.clusterId)) return previous;
  }
  return null;
}

function extractProperEntities(text) {
  const matches = String(text).match(/\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}\b/g) || [];
  return unique(matches.map((entity) => cleanEntity(entity)).filter((entity) => entity.length >= 3)).slice(0, 8);
}

function extractHashtags(text) {
  const matches = String(text).match(/#[A-Za-z0-9_]{3,40}/g) || [];
  return matches.map((tag) => cleanEntity(tag.replace(/^#/, ""))).filter(Boolean);
}

function extractMascotEntities(cleaned) {
  const terms = [
    "cat", "dog", "animal", "robot", "alien", "mascot", "duck", "goose", "squirrel",
    "frog", "bear", "bird", "penguin", "baby", "kid", "guy", "girl", "character",
    "car", "truck", "plane", "hat", "shoe", "toy", "doll", "sign", "camera",
  ];
  return terms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}s?\\b`, "i").test(cleaned));
}

function extractPhrases(words) {
  const phrases = [];
  const candidates = words.filter((word) => word.length >= 3 && !GENERIC_ENTITIES.has(word));
  for (let size = 2; size <= 4; size++) {
    for (let i = 0; i <= candidates.length - size; i++) {
      phrases.push(candidates.slice(i, i + size).join(" "));
    }
  }
  return unique(phrases).slice(0, 16);
}

function cleanText(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/@\w+/g, "")
    .replace(/#(\w+)/g, "$1")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanEntity(entity) {
  return String(entity || "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  const slug = String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
  return slug || "unknown";
}

function overlapCount(setLike, values) {
  const set = setLike instanceof Set ? setLike : new Set(setLike);
  return values.filter((value) => set.has(value)).length;
}

function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function minIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function maxIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function hoursSince(value) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function logCluster(cluster) {
  console.log(
    `   🧠 Cluster ${cluster.clusterId}: state=${cluster.lifecycleState} ` +
    `momentum=${cluster.momentumTrend} posts=${cluster.relatedPosts.length} ` +
    `accounts=${cluster.relatedAccounts.length} attention=${cluster.totalAttention.toLocaleString()} ` +
    `persistence=${cluster.propagationPersistence}/100 readiness=${cluster.launchReadiness}/100 ` +
    `saturation=${cluster.saturationPressure}/100 ` +
    `swarm=${cluster.copycatSwarm ? "yes" : "no"}`
  );
}
