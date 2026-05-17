// ============================================================
// Test OINK live metadata strict rules
// Run: npm run test-live-metadata-rules
// ============================================================

import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "../launchers/pumpPortalProvider.js";
import { createMetadataUploadProvider } from "../metadataAssets.js";

const cluster = {
  clusterId: "cluster-live-rules",
  canonicalEntity: "Banana Dog",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  idealLaunchTiming: "now",
  launchReadiness: 88,
  swarmPressure: 10,
  saturationPressure: 18,
  identityFormationScore: 92,
  propagationPersistence: 84,
  remixGrowthRate: 68,
  quoteChainExpansion: 64,
  memeticArtifact: {
    artifactType: "mascot_artifact",
    artifactStrength: 86,
    visualReuseMode: "reuse_source_media",
    extractedPhrase: "banana dog",
    emotionalTexture: "absurd joy",
    suggestedTicker: "BANANADOG",
    tokenIdentity: "Banana Dog",
    identityCompressionSummary: "mascot artifact: banana dog source image + absurd joy + sticker silhouette",
  },
  artifactStrength: 86,
  sourceArtifactType: "mascot_artifact",
  visualReuseMode: "reuse_source_media",
  extractedPhrase: "banana dog",
  emotionalTexture: "absurd joy",
  identityCompressionSummary: "mascot artifact: banana dog source image + absurd joy + sticker silhouette",
  artifactSuggestedTicker: "BANANADOG",
  relatedPosts: [{
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/456",
    author: "example",
    sourceMedia: {
      sourcePlatform: "x",
      preferred: {
        sourcePlatform: "x",
        sourcePostUrl: "https://x.com/example/status/456",
        sourceAuthor: "example",
        sourceBacklink: "https://x.com/example/status/456",
        sourceMediaUrl: "https://pbs.twimg.com/media/live-rules.jpg",
        mediaType: "photo",
        assetType: "photo",
        url: "https://pbs.twimg.com/media/live-rules.jpg",
        previewImageUrl: "https://pbs.twimg.com/media/live-rules.jpg",
        width: 1200,
        height: 900,
      },
      validation: { valid: true, errors: [], warnings: [] },
    },
    sourceMediaUrl: "https://pbs.twimg.com/media/live-rules.jpg",
    sourceMediaType: "photo",
  }],
  relatedPhrases: ["banana dog"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, { enableRealLaunches: true });

const strictSynthetic = await preparePumpPortalMetadataPackage(deploymentAttempt, {
  liveMode: true,
  strictMode: true,
  downloadRemoteImages: false,
});

console.log("Live metadata strict rules test");
console.log(`Synthetic state: ${strictSynthetic.state}`);
console.log(`Synthetic valid: ${strictSynthetic.metadataValidation.valid ? "yes" : "no"}`);
console.log(`Synthetic image source: ${strictSynthetic.imageReview.source}`);
console.log(`Synthetic live eligible: ${strictSynthetic.report.liveEligible ? "yes" : "no"}`);
console.log(`Synthetic report: ${strictSynthetic.report.liveEligibilityReasons.join(", ") || "none"}`);
console.log(`Metadata image: ${strictSynthetic.report.finalImageUrl || "none"}`);
console.log(`Metadata URL: ${strictSynthetic.report.metadataUrl || "none"}`);

const providers = ["pinata_ipfs", "arweave", "pumpportal"].map((provider) => createMetadataUploadProvider({ provider }).provider);
console.log(`Real upload provider interfaces: ${providers.join(", ")}`);

if (strictSynthetic.metadataValidation.valid) process.exitCode = 1;
if (!strictSynthetic.metadataValidation.errors.includes("hosted_image_url_missing_or_invalid")) process.exitCode = 1;
if (!strictSynthetic.imageValidation.errors.includes("live_mode_rejects_synthetic_download")) process.exitCode = 1;
if (strictSynthetic.report.liveEligible) process.exitCode = 1;
