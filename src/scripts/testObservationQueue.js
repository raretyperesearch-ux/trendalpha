// ============================================================
// Test OINK launch observation queue
// Run: npm run test-observation-queue
// ============================================================

import { createLaunchObservationQueue } from "../observationQueue.js";

const queue = createLaunchObservationQueue({ ttlHours: 1 });
const item = queue.enqueue({
  launchId: "dry-spot",
  ticker: "SPOT",
  title: "Spotghost",
  launchReadiness: 88,
  identityStrength: 91,
  swarmPressure: 12,
});
queue.vote(item.observationId, { reviewer: "lennox", quality: 9, note: "clean identity", wouldLaunchAgain: true });
queue.approve(item.observationId);
const rejected = queue.enqueue({ launchId: "dry-weak", ticker: "WEAK", title: "Weak Meme", launchReadiness: 66, swarmPressure: 70 });
queue.vote(rejected.observationId, { reviewer: "lennox", quality: 3, note: "too saturated", wouldLaunchAgain: false });
queue.reject(rejected.observationId, "too saturated");

console.log("Observation queue test");
console.log(`Approved state: ${queue.get(item.observationId).state}`);
console.log(`Rejected reason: ${queue.get(rejected.observationId).rejectionReason}`);
console.log(`Metrics: ${JSON.stringify(queue.metrics())}`);
console.log(`History count: ${queue.history().length}`);

if (queue.get(item.observationId).state !== "approved") process.exitCode = 1;
if (queue.get(rejected.observationId).state !== "rejected") process.exitCode = 1;
if (queue.metrics().wouldLaunchAgainRate !== 0.5) process.exitCode = 1;
