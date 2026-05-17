// ============================================================
// Test OINK launch saturation safety
// Run: npm run test-saturation-safety
// ============================================================

import { evaluateLaunchSaturationSafety, formatSaturationWarning } from "../saturationSafety.js";
import { formatSaturationWarningAlert } from "../telegram.js";

const now = new Date().toISOString();
const history = [
  { clusterId: "cluster-banana", ticker: "BANANA", narrativeKey: "banana-dog", archetype: "mascot", createdAt: now },
  { clusterId: "cluster-cat", ticker: "CAT", narrativeKey: "cat-camera", archetype: "mascot", createdAt: now },
  { clusterId: "cluster-frog", ticker: "FROG", narrativeKey: "frog-chair", archetype: "mascot", createdAt: now },
];

const duplicate = evaluateLaunchSaturationSafety({
  history,
  cluster: {
    clusterId: "cluster-banana",
    canonicalEntity: "Banana Dog",
    archetype: "mascot",
    launchReadiness: 88,
    swarmPressure: 12,
    saturationPressure: 22,
  },
  shadowLaunch: { ticker: "BANANA" },
});

const globalDisabled = evaluateLaunchSaturationSafety({
  globalDisabled: true,
  history: [],
  cluster: { clusterId: "cluster-new", canonicalEntity: "New Thing", launchReadiness: 90 },
  shadowLaunch: { ticker: "NEW" },
});

console.log("Saturation safety test");
console.log(`Duplicate allowed: ${duplicate.allowed ? "yes" : "no"}`);
console.log(`Duplicate blocks: ${duplicate.blocks.join(", ")}`);
console.log(`Duplicate warnings: ${duplicate.warnings.join(", ") || "none"}`);
console.log(`Global disabled blocks: ${globalDisabled.blocks.join(", ")}`);
console.log(formatSaturationWarning(duplicate));
console.log("\nTelegram preview:");
console.log(formatSaturationWarningAlert({ safety: duplicate, shadowLaunch: { ticker: "BANANA" } }));

if (duplicate.allowed) process.exitCode = 1;
if (!duplicate.blocks.includes("cluster_duplicate_suppressed")) process.exitCode = 1;
if (!duplicate.blocks.includes("ticker_collision_cooldown")) process.exitCode = 1;
if (!globalDisabled.blocks.includes("emergency_global_disable")) process.exitCode = 1;
