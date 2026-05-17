// ============================================================
// Test PumpPortal dry-wire deployment skeleton
// Run: npm run test-pumpportal
// ============================================================

import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment } from "../launchers/pumpPortalProvider.js";
import { formatDeploymentReadyAlert } from "../telegram.js";

const cluster = {
  clusterId: "cluster-banana-dog",
  canonicalEntity: "Banana Dog",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  idealLaunchTiming: "now",
  launchReadiness: 84,
  swarmPressure: 18,
  saturationPressure: 24,
  identityFormationScore: 91,
  propagationPersistence: 78,
  remixGrowthRate: 62,
  quoteChainExpansion: 58,
  memeticArtifact: {
    artifactType: "mascot_artifact",
    artifactStrength: 76,
    visualReuseMode: "isolate_symbol",
    extractedPhrase: "banana dog",
    emotionalTexture: "awe",
    suggestedTicker: "BANANADOG",
    tokenIdentity: "Banana Dog",
    identityCompressionSummary: "mascot artifact: banana dog + awe + source video",
  },
  artifactStrength: 76,
  sourceArtifactType: "mascot_artifact",
  visualReuseMode: "isolate_symbol",
  extractedPhrase: "banana dog",
  emotionalTexture: "awe",
  identityCompressionSummary: "mascot artifact: banana dog + awe + source video",
  artifactSuggestedTicker: "BANANADOG",
  relatedPosts: [{ sourcePlatform: "x" }],
  relatedPhrases: ["banana dog"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch);

console.log("PumpPortal dry-wire deployment test");
console.log(`Ticker: $${deploymentAttempt.ticker}`);
console.log(`Mode: ${deploymentAttempt.mode}`);
console.log(`State: ${deploymentAttempt.deploymentState}`);
console.log(`Valid: ${deploymentAttempt.validation.valid ? "yes" : "no"}`);
console.log(`Broadcast: ${deploymentAttempt.simulation.broadcast ? "yes" : "no"}`);
console.log(`Image placeholder: ${deploymentAttempt.payload.metadata.imageUpload.status}`);
console.log(`Transaction: ${deploymentAttempt.payload.transaction.note}`);
if (deploymentAttempt.validation.errors.length > 0) {
  console.log(`Errors: ${deploymentAttempt.validation.errors.join(", ")}`);
}
if (deploymentAttempt.validation.warnings.length > 0) {
  console.log(`Warnings: ${deploymentAttempt.validation.warnings.join(", ")}`);
}

console.log("\nTelegram preview:");
console.log(formatDeploymentReadyAlert(deploymentAttempt));
