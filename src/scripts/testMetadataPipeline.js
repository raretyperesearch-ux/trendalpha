// ============================================================
// Test OINK metadata pipeline
// Run: npm run test-metadata
// ============================================================

import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment } from "../launchers/pumpPortalProvider.js";
import { formatMetadataReadyAlert } from "../telegram.js";

const shadowLaunch = prepareDryRunPumpPortalLaunch({
  clusterId: "cluster-spotghost",
  canonicalEntity: "Spotghost",
  lifecycleState: "forming",
  launchReadiness: 86,
  swarmPressure: 15,
  identityFormationScore: 91,
  launchWindow: "PRIME_WINDOW",
  idealLaunchTiming: "now",
  memeticArtifact: {
    artifactType: "symbol_artifact",
    artifactStrength: 82,
    visualReuseMode: "isolate_symbol",
    extractedPhrase: "spot ghost",
    emotionalTexture: "awe",
    suggestedTicker: "SPOT",
    tokenIdentity: "Spotghost",
    identityCompressionSummary: "symbol artifact: spot ghost + eerie awe + screenshot silhouette",
  },
  sourceArtifactType: "symbol_artifact",
  artifactStrength: 82,
  visualReuseMode: "isolate_symbol",
  extractedPhrase: "spot ghost",
  emotionalTexture: "awe",
  identityCompressionSummary: "symbol artifact: spot ghost + eerie awe + screenshot silhouette",
  artifactSuggestedTicker: "SPOT",
  relatedPosts: [{ sourcePlatform: "x", sourceUrl: "https://x.com/example/status/123" }],
});

const deployment = preparePumpPortalDeployment(shadowLaunch, {
  imageOptions: {
    mode: "remote_url",
    remoteUrl: "https://example.com/spotghost.png",
  },
});

console.log("Metadata pipeline test");
console.log(`State: ${deployment.payload.metadataState}`);
console.log(`Name: ${deployment.payload.metadata.name}`);
console.log(`Symbol: ${deployment.payload.metadata.symbol}`);
console.log(`Image: ${deployment.payload.metadata.image}`);
console.log(`Description length: ${deployment.payload.metadata.description.length}`);
console.log(`Valid: ${deployment.payload.metadataValidation.valid ? "yes" : "no"}`);
console.log(`Errors: ${deployment.payload.metadataValidation.errors.join(", ") || "none"}`);
console.log("\nTelegram preview:");
console.log(formatMetadataReadyAlert(deployment));
