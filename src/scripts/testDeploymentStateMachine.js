// ============================================================
// Test OINK strict deployment state machine
// Run: npm run test-deployment-state-machine
// ============================================================

import {
  buildIdempotencyKey,
  canTransition,
  classifyDeploymentFailure,
  createDeploymentStateMachine,
  hasReplayConflict,
} from "../deploymentStateMachine.js";

const machine = createDeploymentStateMachine({
  attemptId: "deploy-test",
  idempotencyKey: buildIdempotencyKey({ clusterId: "cluster-a", ticker: "OINK", launchId: "launch-a" }),
});

const path = [
  "clustered",
  "identity_ready",
  "metadata_ready",
  "assets_hosted",
  "payload_ready",
  "validation_passed",
  "deployment_prepared",
];

for (const state of path) machine.transition(state, { reason: `test_${state}` });

console.log("Deployment state machine test");
console.log(`State: ${machine.state}`);
console.log(`Timeline entries: ${machine.timeline.length}`);
console.log(`Idempotency: ${machine.idempotencyKey}`);
console.log(`Replay conflict: ${hasReplayConflict([machine.idempotencyKey], machine.idempotencyKey) ? "yes" : "no"}`);
console.log(`Metadata failure class: ${classifyDeploymentFailure("metadata json missing image")}`);
console.log(`Upload failure class: ${classifyDeploymentFailure("asset upload timeout")}`);
console.log(`Provider failure class: ${classifyDeploymentFailure("PumpPortal response schema mismatch")}`);

let invalidBlocked = false;
try {
  createDeploymentStateMachine().transition("submitted", { reason: "skip_required_states" });
} catch (err) {
  invalidBlocked = true;
  console.log(`Invalid transition blocked: ${err.message}`);
}

if (machine.state !== "deployment_prepared") process.exitCode = 1;
if (!canTransition("deployment_prepared", "awaiting_signature")) process.exitCode = 1;
if (!invalidBlocked) process.exitCode = 1;
if (!hasReplayConflict([machine.idempotencyKey], machine.idempotencyKey)) process.exitCode = 1;
