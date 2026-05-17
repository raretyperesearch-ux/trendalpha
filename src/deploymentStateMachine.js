export const DEPLOYMENT_STATES = [
  "detected",
  "clustered",
  "identity_ready",
  "metadata_ready",
  "assets_hosted",
  "payload_ready",
  "validation_passed",
  "deployment_prepared",
  "awaiting_signature",
  "signed",
  "submitted",
  "confirmed",
  "failed",
  "rolled_back",
];

const ALLOWED_TRANSITIONS = {
  detected: ["clustered", "failed", "rolled_back"],
  clustered: ["identity_ready", "failed", "rolled_back"],
  identity_ready: ["metadata_ready", "failed", "rolled_back"],
  metadata_ready: ["assets_hosted", "failed", "rolled_back"],
  assets_hosted: ["payload_ready", "failed", "rolled_back"],
  payload_ready: ["validation_passed", "failed", "rolled_back"],
  validation_passed: ["deployment_prepared", "failed", "rolled_back"],
  deployment_prepared: ["awaiting_signature", "failed", "rolled_back"],
  awaiting_signature: ["signed", "failed", "rolled_back"],
  signed: ["submitted", "failed", "rolled_back"],
  submitted: ["confirmed", "failed", "rolled_back"],
  confirmed: [],
  failed: ["rolled_back"],
  rolled_back: [],
};

const FAILURE_CLASSES = new Set([
  "metadata_failure",
  "upload_failure",
  "provider_failure",
  "validation_failure",
  "duplicate_launch",
  "chain_failure",
]);

export class DeploymentStateMachine {
  constructor({ attemptId, initialState = "detected", idempotencyKey = "" } = {}) {
    assertKnownState(initialState);
    this.attemptId = attemptId || `deploy-${Date.now()}`;
    this.state = initialState;
    this.idempotencyKey = idempotencyKey || buildIdempotencyKey({ attemptId: this.attemptId });
    this.timeline = [{
      from: null,
      to: initialState,
      reason: "initialized",
      timestamp: new Date().toISOString(),
    }];
    this.failure = null;
  }

  transition(to, { reason = "", meta = {} } = {}) {
    assertKnownState(to);
    if (!canTransition(this.state, to)) {
      const error = new Error(`Invalid deployment transition: ${this.state} -> ${to}`);
      error.failureClass = "validation_failure";
      throw error;
    }
    const from = this.state;
    this.state = to;
    const entry = {
      from,
      to,
      reason,
      meta,
      timestamp: new Date().toISOString(),
    };
    this.timeline.push(entry);
    return entry;
  }

  fail(failureClass, reason, meta = {}) {
    const normalized = normalizeFailureClass(failureClass);
    if (this.state !== "failed") {
      this.transition("failed", { reason, meta: { ...meta, failureClass: normalized } });
    }
    this.failure = {
      failureClass: normalized,
      reason,
      meta,
      timestamp: new Date().toISOString(),
    };
    return this.failure;
  }

  recover(reason = "manual_recovery_hook") {
    return {
      state: this.state,
      available: this.state === "failed",
      hooks: this.state === "failed" ? ["retry_metadata", "retry_upload", "rollback_attempt"] : [],
      reason,
    };
  }

  snapshot() {
    return {
      state: this.state,
      idempotencyKey: this.idempotencyKey,
      timeline: this.timeline,
      failure: this.failure,
    };
  }
}

export function createDeploymentStateMachine(input = {}) {
  return new DeploymentStateMachine(input);
}

export function canTransition(from, to) {
  assertKnownState(from);
  assertKnownState(to);
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function buildIdempotencyKey({ clusterId = "", ticker = "", launchId = "", attemptId = "" } = {}) {
  const raw = [clusterId, ticker, launchId, attemptId].filter(Boolean).join(":") || `attempt:${Date.now()}`;
  return raw.toLowerCase().replace(/[^a-z0-9:_-]/g, "-").slice(0, 180);
}

export function hasReplayConflict(existingKeys = [], idempotencyKey = "") {
  return Boolean(idempotencyKey && existingKeys.includes(idempotencyKey));
}

export function classifyDeploymentFailure(errorOrReason = "") {
  const text = errorOrReason instanceof Error ? errorOrReason.message : JSON.stringify(errorOrReason);
  if (/metadata|image prompt|metadata_json/i.test(text)) return "metadata_failure";
  if (/upload|asset|image|hosting|cdn/i.test(text)) return "upload_failure";
  if (/provider|pumpportal|schema|response|transport/i.test(text)) return "provider_failure";
  if (/validation|invalid|threshold/i.test(text)) return "validation_failure";
  if (/duplicate|ticker|replay|collision/i.test(text)) return "duplicate_launch";
  if (/chain|signature|submitted|confirmed|transaction/i.test(text)) return "chain_failure";
  return "provider_failure";
}

export function normalizeFailureClass(value) {
  return FAILURE_CLASSES.has(value) ? value : classifyDeploymentFailure(value);
}

function assertKnownState(state) {
  if (!DEPLOYMENT_STATES.includes(state)) throw new Error(`Unknown deployment state: ${state}`);
}
