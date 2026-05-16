export const NARRATIVE_PHASES = [
  "emerging",
  "forming",
  "accelerating",
  "breakout",
  "saturated",
  "decaying",
  "dormant",
  "reigniting",
];

export const LAUNCH_WINDOWS = {
  TOO_EARLY: "TOO_EARLY",
  WATCH: "WATCH",
  FORMING_WINDOW: "FORMING_WINDOW",
  PRIME_WINDOW: "PRIME_WINDOW",
  LATE_STAGE: "LATE_STAGE",
  SATURATED: "SATURATED",
};

export const PHASE_RECOMMENDATIONS = {
  DO_NOT_LAUNCH: "DO_NOT_LAUNCH",
  WATCH: "WATCH",
  PREPARE_LAUNCH: "PREPARE_LAUNCH",
  HIGH_CONVICTION: "HIGH_CONVICTION",
  BREAKOUT_FORMING: "BREAKOUT_FORMING",
};

export class NarrativePhaseEngine {
  evaluate(subject = {}) {
    return evaluateNarrativePhase(subject);
  }
}

export function evaluateNarrativePhase(subject = {}) {
  const timing = computeLaunchTimingDiagnostics(subject);
  const saturationPressure = computeSaturationPressure(subject);
  const accelerationScore = computeAccelerationScore(subject);
  const identityScore = computeIdentityFormationScore(subject);
  const swarmPressure = getSwarmPressure(subject);
  const momentumLabel = getMomentumLabel(subject, accelerationScore);
  const crossCommunityTrend = getCrossCommunityTrend(subject);
  const phase = classifyNarrativePhase({
    subject,
    saturationPressure,
    accelerationScore,
    identityScore,
    swarmPressure,
    timing,
  });
  const launchReadiness = computeLaunchReadiness({
    subject,
    phase,
    saturationPressure,
    accelerationScore,
    identityScore,
    swarmPressure,
    timing,
  });
  const launchWindow = getLaunchWindow({ phase, launchReadiness, saturationPressure, swarmPressure, timing });
  const adaptiveThreshold = getAdaptiveLaunchThreshold({ subject, saturationPressure, accelerationScore, identityScore, swarmPressure, timing });
  const earlyConviction = isEarlyConviction({ phase, launchReadiness, saturationPressure, accelerationScore, identityScore, timing });
  const recommendation = getPhaseRecommendation({
    phase,
    launchReadiness,
    saturationPressure,
    swarmPressure,
    launchWindow,
    adaptiveThreshold,
    earlyConviction,
  });

  return {
    narrativePhase: phase,
    phaseLabel: phase.toUpperCase(),
    phaseZone: getPhaseZone(launchReadiness),
    momentumState: momentumLabel,
    crossCommunityTrend,
    swarmPressure,
    saturationPressure,
    accelerationScore,
    identityFormationScore: identityScore,
    ...timing,
    idealLaunchTiming: getIdealLaunchTiming({ phase, launchWindow, timing }),
    launchWindow,
    adaptiveLaunchThreshold: adaptiveThreshold,
    earlyConviction,
    launchReadiness,
    phaseRecommendation: recommendation,
    phaseReason: getPhaseReason({ phase, saturationPressure, accelerationScore, identityScore, swarmPressure, launchWindow, timing }),
  };
}

export function computeSaturationPressure(subject = {}) {
  const totalViews = Number(subject.totalViews || subject.totalAttention || 0);
  const likes = Number(subject.likeCount || 0);
  const propagationRatio = Number(subject.propagationRatio || 0);
  const quoteVelocity = Number(subject.quoteVelocity || average(subject.relatedPosts?.map((post) => post.quoteVelocity) || []) || 0);
  const quoteVelocityDelta = Number(subject.quoteVelocityDelta || 0);
  const shareVelocityDelta = Number(subject.shareVelocityDelta || 0);
  const accelerationSlope = Number(subject.accelerationSlope || subject.accelerationDelta || 0);
  const remixability = labelToScore(subject.remixabilityLabel);
  const swarm = getSwarmPressure(subject);
  let pressure = 0;

  if (totalViews >= 10_000_000) pressure += 28;
  else if (totalViews >= 5_000_000) pressure += 22;
  else if (totalViews >= 1_000_000) pressure += 14;
  else if (totalViews >= 500_000) pressure += 8;

  if (likes >= 250_000 && propagationRatio < 0.05) pressure += 22;
  else if (likes >= 100_000 && propagationRatio < 0.07) pressure += 15;

  if (quoteVelocity <= 2 && totalViews >= 1_000_000) pressure += 12;
  if (quoteVelocityDelta < 0) pressure += 12;
  if (shareVelocityDelta < 0) pressure += 8;
  if (accelerationSlope < 0) pressure += 8;
  if (remixability <= 4 && totalViews >= 1_000_000) pressure += 12;
  pressure += Math.min(22, swarm * 0.35);

  if (subject.viralShape === "saturated" || subject.viralShape === "low_conversion") pressure += 18;
  if (subject.marketMatchStatus === "canonical" || subject.marketStatus === "canonical") pressure += 14;
  if (subject.cryptoSaturatedLanguage) pressure += 8;

  return clamp(Math.round(pressure), 0, 100);
}

function computeAccelerationScore(subject = {}) {
  let score = 0;
  if (subject.momentumTrend === "reigniting") score += 30;
  else if (subject.momentumTrend === "rising") score += 22;
  else if (subject.momentumTrend === "stable") score += 8;
  else if (subject.momentumTrend === "decaying") score -= 16;

  if (Number(subject.attentionMomentumDelta || 0) > 0) score += 12;
  if (Number(subject.quoteVelocityDelta || 0) > 0) score += 16;
  if (Number(subject.shareVelocityDelta || 0) > 0) score += 12;
  if (Number(subject.accelerationSlope || subject.accelerationDelta || 0) > 0) score += 10;
  if (Number(subject.quoteAcceleration || 0) >= 3) score += 12;
  if (Number(subject.repostAcceleration || 0) >= 3) score += 10;
  if (Number(subject.crossCommunitySpreadScore || subject.communitySpreadScore || 0) >= 150) score += 12;
  if (subject.quoteExplosion) score += 10;

  return clamp(Math.round(score), 0, 100);
}

function computeIdentityFormationScore(subject = {}) {
  let score = 0;
  score += Number(subject.communityFormationScore || 0) * 5;
  if (["mascot", "identity", "movement", "collectible", "phrase"].includes(subject.marketArchetype || subject.archetype)) score += 20;
  if (labelToScore(subject.remixabilityLabel) >= 6) score += 14;
  if (subject.unclaimedAttention || subject.marketStatus === "unclaimed") score += 10;
  if (Number(subject.engagementToFollowerRate || 0) >= 0.03) score += 10;
  if (Number(subject.propagationRatio || 0) >= 0.12) score += 10;
  return clamp(Math.round(score), 0, 100);
}

function classifyNarrativePhase({ subject, saturationPressure, accelerationScore, identityScore, swarmPressure, timing }) {
  if (subject.momentumTrend === "reigniting" || subject.lifecycleState === "reigniting") return "reigniting";
  if (subject.momentumTrend === "decaying" || subject.lifecycleState === "decaying") return "decaying";
  if (subject.lifecycleState === "dormant" || timing.momentumPersistence <= 8) return "dormant";
  if (saturationPressure >= 72 || swarmPressure >= 70 || subject.lifecycleState === "saturated") return "saturated";
  if (accelerationScore >= 72 && identityScore >= 52 && saturationPressure < 58 && timing.quoteChainExpansion >= 45) return "breakout";
  if (accelerationScore >= 52 && saturationPressure < 65 && timing.accelerationSlope >= 20) return "accelerating";
  if (identityScore >= 45 || Number(subject.launchWorthinessScore || 0) >= 62 || timing.remixGrowthRate >= 35) return "forming";
  return "emerging";
}

function computeLaunchReadiness({ subject, phase, saturationPressure, accelerationScore, identityScore, swarmPressure, timing }) {
  const worthiness = Number(subject.launchWorthinessScore || 0);
  const marketability = Number(subject.marketabilityScore || 0);
  let score =
    worthiness * 0.42 +
    accelerationScore * 0.28 +
    identityScore * 0.2 +
    marketability * 0.1 +
    timing.launchTimingScore * 0.18;

  if (phase === "forming") score += 6;
  if (phase === "accelerating") score += 10;
  if (phase === "breakout") score += 12;
  if (phase === "reigniting") score += 10;
  if (phase === "dormant") score -= 20;
  if (phase === "saturated") score -= 24;
  if (phase === "decaying") score -= 28;

  score -= saturationPressure * 0.22;
  score -= swarmPressure * 0.18;

  if (worthiness >= 90 && saturationPressure >= 55) score -= 10;
  if (worthiness >= 75 && worthiness <= 82 && accelerationScore >= 55 && saturationPressure < 45) score += 8;
  if (timing.quoteExplosionWindow && saturationPressure < 55) score += 6;
  if (timing.remixExpansionWindow && swarmPressure < 45) score += 5;
  if (timing.crossCommunityBreakoutTiming === "now") score += 6;
  if (timing.missedWindow) score -= 14;

  return clamp(Math.round(score), 0, 100);
}

function getPhaseRecommendation({ phase, launchReadiness, saturationPressure, swarmPressure, launchWindow, adaptiveThreshold, earlyConviction }) {
  if (launchWindow === LAUNCH_WINDOWS.SATURATED || phase === "saturated" || phase === "decaying" || saturationPressure >= 78 || swarmPressure >= 75) {
    return PHASE_RECOMMENDATIONS.DO_NOT_LAUNCH;
  }
  if (launchWindow === LAUNCH_WINDOWS.TOO_EARLY) return PHASE_RECOMMENDATIONS.WATCH;
  if (earlyConviction && launchReadiness >= adaptiveThreshold) return PHASE_RECOMMENDATIONS.PREPARE_LAUNCH;
  if (phase === "reigniting" && launchReadiness >= 72) return PHASE_RECOMMENDATIONS.HIGH_CONVICTION;
  if (phase === "breakout" && launchReadiness >= adaptiveThreshold) return PHASE_RECOMMENDATIONS.HIGH_CONVICTION;
  if (phase === "accelerating" && launchReadiness >= adaptiveThreshold) return PHASE_RECOMMENDATIONS.PREPARE_LAUNCH;
  if (phase === "forming" && launchReadiness >= adaptiveThreshold) return PHASE_RECOMMENDATIONS.PREPARE_LAUNCH;
  if (launchReadiness >= 62) return PHASE_RECOMMENDATIONS.WATCH;
  return PHASE_RECOMMENDATIONS.DO_NOT_LAUNCH;
}

function getPhaseZone(readiness) {
  if (readiness >= 90) return "possible_saturation_zone";
  if (readiness >= 82) return "high_conviction_breakout_zone";
  if (readiness >= 75) return "early_formation_zone";
  if (readiness >= 62) return "watch_zone";
  return "reject_zone";
}

function getMomentumLabel(subject, accelerationScore) {
  if (subject.momentumTrend === "reigniting") return "REIGNITING";
  if (subject.momentumTrend === "decaying") return "DECAYING";
  if (accelerationScore >= 70) return "ACCELERATING";
  if (accelerationScore >= 45) return "RISING";
  return "STABLE";
}

function getCrossCommunityTrend(subject) {
  const spread = Number(subject.crossCommunitySpreadScore || subject.communitySpreadScore || 0);
  if (Number(subject.quoteVelocityDelta || 0) > 0 || Number(subject.shareVelocityDelta || 0) > 0) return "RISING";
  if (spread >= 220) return "HIGH";
  if (spread >= 120) return "MEDIUM";
  return "LOW";
}

function getSwarmPressure(subject = {}) {
  let pressure = 0;
  if (subject.copycatSwarm) pressure += 45;
  pressure += Math.min(35, Number(subject.swarmPollutionScore || 0));
  if (subject.marketMatchCandidates?.length >= 3) pressure += Math.min(20, subject.marketMatchCandidates.length * 4);
  if (subject.cryptoSaturatedLanguage) pressure += 8;
  return clamp(Math.round(pressure), 0, 100);
}

function getPhaseReason({ phase, saturationPressure, accelerationScore, identityScore, swarmPressure, launchWindow, timing }) {
  if (phase === "saturated") return "Visibility or swarm pressure is high enough that the narrative may already be fully discovered.";
  if (phase === "decaying") return "Momentum and propagation are flattening or declining.";
  if (phase === "dormant") return "The narrative is quiet and needs renewed acceleration before launch review.";
  if (phase === "reigniting") return "A dormant narrative is accelerating again.";
  if (phase === "breakout") return `Breakout timing is ${launchWindow}; quote expansion ${timing.quoteChainExpansion}/100 and saturation ${saturationPressure}/100.`;
  if (phase === "accelerating") return `Acceleration inflection is building; launch window ${launchWindow}.`;
  if (phase === "forming") return `Identity signals are forming before full saturation; launch window ${launchWindow}.`;
  return `Early signal: acceleration ${accelerationScore}/100, identity ${identityScore}/100, saturation ${saturationPressure}/100, swarm ${swarmPressure}/100.`;
}

function computeLaunchTimingDiagnostics(subject = {}) {
  const accelerationSlope = normalizeSignedDelta(
    Number(subject.accelerationSlope || subject.accelerationDelta || subject.engagementAcceleration || 0),
    1000
  );
  const momentumPersistence = getMomentumPersistence(subject);
  const quoteChainExpansion = getQuoteChainExpansion(subject);
  const propagationHalfLife = estimatePropagationHalfLife(subject);
  const remixGrowthRate = getRemixGrowthRate(subject);
  const crossCommunitySpread = Number(subject.crossCommunitySpreadScore || subject.communitySpreadScore || 0);
  const crossCommunityBreakoutTiming = getCrossCommunityBreakoutTiming({ subject, crossCommunitySpread });
  const quoteExplosionWindow = Boolean(subject.quoteExplosion || (quoteChainExpansion >= 65 && accelerationSlope >= 20));
  const remixExpansionWindow = remixGrowthRate >= 45 && Number(subject.swarmPollutionScore || 0) < 25;
  const accelerationInflectionPoint = accelerationSlope >= 55
    ? "sharp_upshift"
    : accelerationSlope >= 25
      ? "building"
      : accelerationSlope <= -25
        ? "flattening"
        : "stable";
  const missedWindow = (
    (subject.viralShape === "saturated" || Number(subject.saturationRisk || 0) >= 75) &&
    quoteChainExpansion < 25 &&
    remixGrowthRate < 30
  );
  const launchTimingScore = clamp(Math.round(
    accelerationSlope * 0.28 +
    momentumPersistence * 0.22 +
    quoteChainExpansion * 0.24 +
    remixGrowthRate * 0.16 +
    (crossCommunityBreakoutTiming === "now" ? 10 : crossCommunityBreakoutTiming === "building" ? 6 : 0) -
    (missedWindow ? 18 : 0)
  ), 0, 100);

  return {
    accelerationSlope,
    momentumPersistence,
    quoteChainExpansion,
    propagationHalfLife,
    remixGrowthRate,
    quoteExplosionWindow,
    remixExpansionWindow,
    crossCommunityBreakoutTiming,
    accelerationInflectionPoint,
    missedWindow,
    launchTimingScore,
  };
}

function getLaunchWindow({ phase, launchReadiness, saturationPressure, swarmPressure, timing }) {
  if (phase === "saturated" || saturationPressure >= 78 || swarmPressure >= 75 || timing.missedWindow) return LAUNCH_WINDOWS.SATURATED;
  if (phase === "decaying") return LAUNCH_WINDOWS.LATE_STAGE;
  if (phase === "dormant") return LAUNCH_WINDOWS.WATCH;
  if (phase === "emerging" && launchReadiness < 58) return LAUNCH_WINDOWS.TOO_EARLY;
  if (phase === "forming" && launchReadiness >= 68 && saturationPressure < 55) return LAUNCH_WINDOWS.FORMING_WINDOW;
  if (["accelerating", "breakout", "reigniting"].includes(phase) && launchReadiness >= 75 && saturationPressure < 68) return LAUNCH_WINDOWS.PRIME_WINDOW;
  if (launchReadiness >= 62) return LAUNCH_WINDOWS.WATCH;
  return LAUNCH_WINDOWS.TOO_EARLY;
}

function getAdaptiveLaunchThreshold({ subject, saturationPressure, accelerationScore, identityScore, swarmPressure, timing }) {
  let threshold = 78;
  threshold += Math.round(swarmPressure * 0.12);
  threshold += Math.round(saturationPressure * 0.1);
  threshold -= Math.round(accelerationScore * 0.08);
  threshold -= Math.round(identityScore * 0.06);
  threshold -= Math.round(timing.launchTimingScore * 0.06);
  if (subject.unclaimedAttention || subject.marketStatus === "unclaimed") threshold -= 3;
  if (timing.crossCommunityBreakoutTiming === "now") threshold -= 3;
  if (timing.missedWindow) threshold += 12;
  return clamp(threshold, 68, 88);
}

function isEarlyConviction({ phase, launchReadiness, saturationPressure, accelerationScore, identityScore, timing }) {
  return (
    ["forming", "accelerating"].includes(phase) &&
    launchReadiness >= 72 &&
    accelerationScore >= 55 &&
    identityScore >= 48 &&
    saturationPressure < 48 &&
    timing.crossCommunityBreakoutTiming !== "none"
  );
}

function getIdealLaunchTiming({ phase, launchWindow, timing }) {
  if (launchWindow === LAUNCH_WINDOWS.PRIME_WINDOW) return "now";
  if (launchWindow === LAUNCH_WINDOWS.FORMING_WINDOW) return timing.accelerationInflectionPoint === "building" ? "next_scan_to_2h" : "watch_next_scan";
  if (phase === "emerging") return "wait_for_identity_confirmation";
  if (launchWindow === LAUNCH_WINDOWS.LATE_STAGE) return "review_only_late";
  if (launchWindow === LAUNCH_WINDOWS.SATURATED) return "missed_or_polluted";
  return "watch";
}

function getMomentumPersistence(subject) {
  if (subject.momentumTrend === "reigniting") return 85;
  if (subject.momentumTrend === "rising") return 70;
  if (subject.momentumTrend === "stable") return 42;
  if (subject.momentumTrend === "decaying") return 12;
  const persistence = Number(subject.propagationPersistence || 0);
  if (persistence) return clamp(persistence, 0, 100);
  return 35;
}

function getQuoteChainExpansion(subject) {
  const quoteVelocity = Number(subject.quoteVelocity || average(subject.relatedPosts?.map((post) => post.quoteVelocity) || []) || 0);
  const quoteDelta = Number(subject.quoteVelocityDelta || 0);
  const quoteAcceleration = Number(subject.quoteAcceleration || 0);
  let score = 0;
  if (quoteVelocity >= 100) score += 35;
  else if (quoteVelocity >= 40) score += 26;
  else if (quoteVelocity >= 15) score += 16;
  if (quoteDelta > 0) score += 22;
  if (quoteAcceleration >= 3) score += 22;
  if (subject.quoteExplosion) score += 18;
  return clamp(score, 0, 100);
}

function estimatePropagationHalfLife(subject) {
  const velocity = Number(subject.shareVelocity || average(subject.relatedPosts?.map((post) => post.shareVelocity) || []) || 0);
  const momentum = Number(subject.attentionMomentum || subject.totalMomentum || 0);
  if (subject.momentumTrend === "decaying") return "short";
  if (velocity >= 250 || momentum >= 250_000) return "medium_to_long";
  if (velocity >= 75 || momentum >= 75_000) return "medium";
  return "short";
}

function getRemixGrowthRate(subject) {
  const remixCount = Number(subject.remixCount || 0);
  const quoteExpansion = getQuoteChainExpansion(subject);
  const remixability = labelToScore(subject.remixabilityLabel) * 9;
  const mutation = Number(subject.marketabilityScore || 0) * 0.35;
  return clamp(Math.round(quoteExpansion * 0.45 + remixability * 0.25 + mutation + Math.min(18, remixCount / 250)), 0, 100);
}

function getCrossCommunityBreakoutTiming({ subject, crossCommunitySpread }) {
  if (Number(subject.quoteVelocityDelta || 0) > 0 && Number(subject.shareVelocityDelta || 0) > 0 && crossCommunitySpread >= 120) return "now";
  if (crossCommunitySpread >= 220) return "now";
  if (crossCommunitySpread >= 120 || subject.viralShape === "cross_community") return "building";
  return "none";
}

function normalizeSignedDelta(value, divisor) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.round((value / divisor) * 100), -100, 100);
}

function labelToScore(label) {
  const normalized = String(label || "").toUpperCase();
  if (normalized === "HIGH") return 9;
  if (normalized === "STRONG") return 7;
  if (normalized === "MEDIUM") return 5;
  if (normalized === "LOW") return 2;
  return 0;
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (nums.length === 0) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
