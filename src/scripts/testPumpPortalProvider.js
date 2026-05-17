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
  relatedPosts: [{
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/123",
    author: "example",
    sourceMedia: {
      sourcePlatform: "x",
      preferred: {
        sourcePlatform: "x",
        sourcePostUrl: "https://x.com/example/status/123",
        sourceAuthor: "example",
        sourceBacklink: "https://x.com/example/status/123",
        sourceMediaUrl: "https://pbs.twimg.com/media/banana-dog.jpg",
        mediaType: "photo",
        assetType: "photo",
        url: "https://pbs.twimg.com/media/banana-dog.jpg",
        previewImageUrl: "https://pbs.twimg.com/media/banana-dog.jpg",
        width: 1200,
        height: 900,
      },
      candidates: [],
      validation: { valid: true, errors: [], warnings: [] },
    },
    sourceMediaUrl: "https://pbs.twimg.com/media/banana-dog.jpg",
    sourceMediaType: "photo",
  }],
  relatedPhrases: ["banana dog"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, {
  imageOptions: {
    mode: "remote_url",
    remoteUrl: "https://example.com/banana-dog.png",
  },
});

console.log("PumpPortal dry-wire deployment test");
console.log(`Ticker: $${deploymentAttempt.ticker}`);
console.log(`Mode: ${deploymentAttempt.mode}`);
console.log(`State: ${deploymentAttempt.deploymentState}`);
console.log(`Valid: ${deploymentAttempt.validation.valid ? "yes" : "no"}`);
console.log(`Broadcast: ${deploymentAttempt.simulation.broadcast ? "yes" : "no"}`);
console.log(`Image status: ${deploymentAttempt.payload.metadata.imageUpload.validationStatus}`);
console.log(`Transaction: ${deploymentAttempt.payload.transaction.note}`);
if (deploymentAttempt.validation.errors.length > 0) {
  console.log(`Errors: ${deploymentAttempt.validation.errors.join(", ")}`);
}
if (deploymentAttempt.validation.warnings.length > 0) {
  console.log(`Warnings: ${deploymentAttempt.validation.warnings.join(", ")}`);
}

console.log("\nTelegram preview:");
console.log(formatDeploymentReadyAlert(deploymentAttempt));
