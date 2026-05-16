import { serializeNarrativeCluster } from "./narrativeClusters.js";

const PHASE_ORDER = [
  "emerging",
  "forming",
  "accelerating",
  "breakout",
  "saturated",
  "decaying",
  "dormant",
  "reigniting",
];

export class NarrativeMemoryService {
  buildSnapshotRow(cluster) {
    const analytics = this.calculateLifecycleAnalytics(cluster);
    return {
      cluster_id: safeText(cluster.clusterId, 160),
      cluster_name: safeText(cluster.canonicalEntity || cluster.clusterId || "Narrative Cluster", 255),
      timestamp: new Date().toISOString(),
      narrative_phase: safeText(cluster.lifecycleState || cluster.narrativePhase || "emerging", 40),
      momentum_state: safeText(cluster.momentumTrend || "stable", 40),
      propagation_shape: safeText(cluster.viralShapeReason || cluster.launchWindow || "unknown", 255),
      launch_worthiness: intValue(cluster.launchWorthinessScore),
      persistence_score: intValue(cluster.propagationPersistence),
      identity_strength: intValue(cluster.identityFormationScore || cluster.communityFormationScore || cluster.launchWorthinessScore),
      swarm_pressure: intValue(cluster.swarmPressure),
      narrative_uniqueness: intValue(this.getNarrativeUniqueness(cluster)),
      launch_readiness: intValue(cluster.launchReadiness),
      total_attention: intValue(cluster.totalAttention),
      total_posts: intValue(cluster.relatedPosts?.length),
      total_accounts: intValue(cluster.relatedAccounts?.length),
      cross_community_score: intValue(cluster.communitySpreadScore),
      remixability_score: intValue(cluster.remixGrowthRate || cluster.remixCount),
      saturation_score: intValue(cluster.saturationPressure),
      acceleration_score: intValue(cluster.accelerationSlope || cluster.accelerationDelta),
      snapshot: {
        ...serializeNarrativeCluster(cluster),
        memoryAnalytics: analytics,
      },
      created_at: new Date().toISOString(),
    };
  }

  buildMinimalSnapshotRow(cluster) {
    return {
      cluster_id: safeText(cluster.clusterId, 160),
      cluster_name: safeText(cluster.canonicalEntity || cluster.clusterId || "Narrative Cluster", 255),
      timestamp: new Date().toISOString(),
      narrative_phase: safeText(cluster.lifecycleState || "emerging", 40),
      momentum_state: safeText(cluster.momentumTrend || "stable", 40),
      launch_worthiness: intValue(cluster.launchWorthinessScore),
      persistence_score: intValue(cluster.propagationPersistence),
      launch_readiness: intValue(cluster.launchReadiness),
      total_attention: intValue(cluster.totalAttention),
      total_posts: intValue(cluster.relatedPosts?.length),
      total_accounts: intValue(cluster.relatedAccounts?.length),
      created_at: new Date().toISOString(),
    };
  }

  calculateLifecycleAnalytics(cluster, history = []) {
    const sortedHistory = normalizeHistoryRows(history)
      .filter((row) => row.clusterId === cluster.clusterId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const last = sortedHistory[sortedHistory.length - 1] || null;
    const ageHours = getAgeHours(cluster.firstSeenAt || last?.timestamp);
    const phaseTransition = last && last.narrativePhase !== cluster.lifecycleState
      ? `${last.narrativePhase}->${cluster.lifecycleState}`
      : null;

    return {
      persistenceHalfLife: this.estimatePersistenceHalfLife(cluster, sortedHistory),
      momentumDurability: this.getMomentumDurability(cluster, sortedHistory),
      attentionAcceleration: this.getDelta(cluster.totalAttention, last?.totalAttention),
      saturationAcceleration: this.getDelta(cluster.saturationPressure, last?.saturationScore),
      clusterStability: this.getClusterStability(cluster, sortedHistory),
      narrativeDecayCurve: this.getNarrativeDecayCurve(cluster, sortedHistory),
      reEmergenceEvent: this.detectReEmergence(cluster, sortedHistory),
      phaseTransition,
      ageHours,
      reEmergenceRisk: this.getReEmergenceRisk(cluster, sortedHistory),
      momentumStabilityLabel: this.getMomentumStabilityLabel(cluster, sortedHistory),
    };
  }

  normalizeHistoryRows(rows = []) {
    return normalizeHistoryRows(rows);
  }

  getRejectedFieldDiagnostics(row) {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        {
          type: Array.isArray(value) ? "array" : typeof value,
          value: typeof value === "object" && value !== null ? "[object]" : String(value).slice(0, 120),
        },
      ])
    );
  }

  detectReEmergence(cluster, history = []) {
    const sortedHistory = normalizeHistoryRows(history)
      .filter((row) => row.clusterId === cluster.clusterId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const last = sortedHistory[sortedHistory.length - 1];
    if (!last) return false;
    const wasQuiet = ["dormant", "decaying"].includes(last.narrativePhase) || getAgeHours(last.timestamp) >= 18;
    const acceleratingAgain =
      cluster.lifecycleState === "reigniting" ||
      intValue(cluster.launchReadiness) >= intValue(last.launchReadiness) + 15 ||
      intValue(cluster.accelerationSlope) > 25 ||
      intValue(cluster.quoteChainExpansion) > 55;
    return wasQuiet && acceleratingAgain;
  }

  estimatePersistenceHalfLife(cluster, history = []) {
    if (cluster.propagationHalfLife) return cluster.propagationHalfLife;
    if (cluster.momentumTrend === "decaying") return "short";
    if (cluster.propagationPersistence >= 75) return "medium_to_long";
    if (cluster.propagationPersistence >= 45) return "medium";
    return "short";
  }

  getMomentumDurability(cluster, history = []) {
    const last = history[history.length - 1];
    let score = intValue(cluster.momentumPersistence || cluster.propagationPersistence);
    if (last && intValue(cluster.launchReadiness) > intValue(last.launchReadiness)) score += 8;
    if (cluster.momentumTrend === "decaying") score -= 18;
    return clampInt(score, 0, 100);
  }

  getClusterStability(cluster, history = []) {
    let score = 45;
    score += Math.min(25, intValue(cluster.relatedPosts?.length) * 4);
    score += Math.min(20, intValue(cluster.relatedAccounts?.length) * 5);
    if (history.length >= 2) score += 10;
    if (cluster.copycatSwarm) score -= 20;
    if (cluster.lifecycleState === "decaying") score -= 15;
    return clampInt(score, 0, 100);
  }

  getNarrativeDecayCurve(cluster, history = []) {
    const last = history[history.length - 1];
    if (!last) return "unknown";
    const readinessDelta = intValue(cluster.launchReadiness) - intValue(last.launchReadiness);
    const saturationDelta = intValue(cluster.saturationPressure) - intValue(last.saturationScore);
    if (readinessDelta > 8) return "rising";
    if (readinessDelta < -8 || saturationDelta > 12) return "decaying";
    return "stable";
  }

  getReEmergenceRisk(cluster, history = []) {
    if (this.detectReEmergence(cluster, history)) return "HIGH";
    if (cluster.lifecycleState === "dormant" && cluster.quoteChainExpansion >= 35) return "MODERATE";
    return "LOW";
  }

  getMomentumStabilityLabel(cluster, history = []) {
    const durability = this.getMomentumDurability(cluster, history);
    if (durability >= 75) return "HIGH";
    if (durability >= 45) return "MODERATE";
    return "LOW";
  }

  getDelta(current, previous) {
    if (previous === null || previous === undefined) return 0;
    return intValue(current) - intValue(previous);
  }

  getNarrativeUniqueness(cluster) {
    let score = 60;
    score += Math.min(20, intValue(cluster.relatedPhrases?.length) * 2);
    score += Math.min(15, intValue(cluster.relatedAccounts?.length) * 3);
    if (cluster.copycatSwarm) score -= 35;
    if (cluster.marketStatus === "canonical") score -= 20;
    return clampInt(score, 0, 100);
  }
}

export function normalizeHistoryRows(rows = []) {
  return rows.map((row) => {
    const snapshot = row.snapshot || row.score_breakdown?.narrativeCluster || {};
    return {
      clusterId: snapshot.clusterId || row.cluster_id || String(row.trend_id || "").replace(/^cluster:/, ""),
      clusterName: snapshot.canonicalEntity || row.cluster_name || row.canonical_entity || row.trend_name,
      timestamp: row.timestamp || row.scanned_at || row.created_at,
      narrativePhase: row.narrative_phase || snapshot.lifecycleState || row.lifecycle_state || "emerging",
      momentumState: row.momentum_state || snapshot.momentumTrend || "stable",
      launchReadiness: row.launch_readiness ?? snapshot.launchReadiness ?? 0,
      totalAttention: row.total_attention ?? snapshot.totalAttention ?? 0,
      persistenceScore: row.persistence_score ?? snapshot.propagationPersistence ?? 0,
      saturationScore: row.saturation_score ?? snapshot.saturationPressure ?? 0,
      accelerationScore: row.acceleration_score ?? snapshot.accelerationSlope ?? 0,
      snapshot,
    };
  }).filter((row) => row.clusterId);
}

function intValue(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num);
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, intValue(value)));
}

function safeText(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function getAgeHours(value) {
  if (!value) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 3600000));
}
