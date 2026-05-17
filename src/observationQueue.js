export const OBSERVATION_STATES = ["queued_for_review", "approved", "rejected", "expired"];

export class LaunchObservationQueue {
  constructor({ ttlHours = 72 } = {}) {
    this.ttlHours = ttlHours;
    this.items = [];
  }

  enqueue(shadowLaunch, deploymentAttempt = null) {
    const item = {
      observationId: `obs-${shadowLaunch.launchId || shadowLaunch.ticker}-${Date.now()}`,
      state: "queued_for_review",
      shadowLaunch,
      deploymentAttempt,
      votes: [],
      rejectionReason: "",
      wouldLaunchAgain: null,
      calibration: {
        readiness: Number(shadowLaunch.launchReadiness || 0),
        identityStrength: Number(shadowLaunch.identityStrength || shadowLaunch.payload?.narrative?.identityStrength || 0),
        saturation: Number(shadowLaunch.swarmPressure || shadowLaunch.payload?.narrative?.swarmPressure || 0),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.push(item);
    return item;
  }

  vote(observationId, { reviewer = "operator", quality = 0, note = "", wouldLaunchAgain = null } = {}) {
    const item = this.get(observationId);
    item.votes.push({ reviewer, quality: Number(quality), note, wouldLaunchAgain, timestamp: new Date().toISOString() });
    item.wouldLaunchAgain = wouldLaunchAgain;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  approve(observationId) {
    return this.setState(observationId, "approved");
  }

  reject(observationId, reason) {
    const item = this.setState(observationId, "rejected");
    item.rejectionReason = reason || "unspecified";
    return item;
  }

  expireOld(now = Date.now()) {
    for (const item of this.items) {
      if (item.state === "queued_for_review" && (now - new Date(item.createdAt).getTime()) / 3600000 > this.ttlHours) {
        item.state = "expired";
        item.updatedAt = new Date().toISOString();
      }
    }
    return this.items.filter((item) => item.state === "expired");
  }

  metrics() {
    const reviewed = this.items.filter((item) => ["approved", "rejected"].includes(item.state));
    return {
      total: this.items.length,
      queued: this.items.filter((item) => item.state === "queued_for_review").length,
      approved: this.items.filter((item) => item.state === "approved").length,
      rejected: this.items.filter((item) => item.state === "rejected").length,
      expired: this.items.filter((item) => item.state === "expired").length,
      avgQuality: average(this.items.flatMap((item) => item.votes.map((vote) => vote.quality))),
      wouldLaunchAgainRate: reviewed.length
        ? reviewed.filter((item) => item.wouldLaunchAgain === true).length / reviewed.length
        : 0,
    };
  }

  history() {
    return this.items;
  }

  get(observationId) {
    const item = this.items.find((candidate) => candidate.observationId === observationId);
    if (!item) throw new Error(`Observation not found: ${observationId}`);
    return item;
  }

  setState(observationId, state) {
    if (!OBSERVATION_STATES.includes(state)) throw new Error(`Invalid observation state: ${state}`);
    const item = this.get(observationId);
    item.state = state;
    item.updatedAt = new Date().toISOString();
    return item;
  }
}

export function createLaunchObservationQueue(options = {}) {
  return new LaunchObservationQueue(options);
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(2));
}
