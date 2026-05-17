// ============================================================
// Test PumpPortal hosted metadata dry-wire pipeline
// Run: npm run test-pumpportal-metadata
// ============================================================

import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "../launchers/pumpPortalProvider.js";

const cluster = {
  clusterId: "cluster-source-artifact",
  canonicalEntity: "Banana Dog",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  idealLaunchTiming: "now",
  launchReadiness: 86,
  swarmPressure: 12,
  saturationPressure: 20,
  identityFormationScore: 90,
  propagationPersistence: 82,
  remixGrowthRate: 66,
  quoteChainExpansion: 61,
  memeticArtifact: {
    artifactType: "mascot_artifact",
    artifactStrength: 84,
    visualReuseMode: "reuse_source_media",
    extractedPhrase: "banana dog",
    emotionalTexture: "absurd joy",
    suggestedTicker: "BANANADOG",
    tokenIdentity: "Banana Dog",
    identityCompressionSummary: "mascot artifact: banana dog source image + absurd joy + sticker silhouette",
  },
  artifactStrength: 84,
  sourceArtifactType: "mascot_artifact",
  visualReuseMode: "reuse_source_media",
  extractedPhrase: "banana dog",
  emotionalTexture: "absurd joy",
  identityCompressionSummary: "mascot artifact: banana dog source image + absurd joy + sticker silhouette",
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
        sourceMediaUrl: "https://pbs.twimg.com/media/banana-dog-source.jpg",
        mediaType: "photo",
        assetType: "photo",
        url: "https://pbs.twimg.com/media/banana-dog-source.jpg",
        previewImageUrl: "https://pbs.twimg.com/media/banana-dog-source.jpg",
        width: 1200,
        height: 900,
      },
      validation: { valid: true, errors: [], warnings: [] },
    },
    sourceMediaUrl: "https://pbs.twimg.com/media/banana-dog-source.jpg",
    sourceMediaType: "photo",
  }],
  relatedPhrases: ["banana dog"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch);
const hosted = await preparePumpPortalMetadataPackage(deploymentAttempt, {
  downloadRemoteImages: false,
});

console.log("PumpPortal hosted metadata dry-wire test");
console.log(`Deployment valid: ${deploymentAttempt.validation.valid ? "yes" : "no"}`);
console.log(`Image source: ${deploymentAttempt.payload.metadata.imageUpload.imageSource}`);
console.log(`Hosted state: ${hosted.state}`);
console.log(`Hosted image: ${hosted.imageUpload?.hostedImageUrl || "none"}`);
console.log(`Metadata URL: ${hosted.metadataUpload?.metadataUrl || "none"}`);
console.log(`Metadata image field: ${hosted.metadataJson.image}`);
console.log(`Report image URL: ${hosted.report.finalImageUrl || "none"}`);
console.log(`Report metadata URL: ${hosted.report.metadataUrl || "none"}`);
console.log(`Report image source: ${hosted.report.imageSource || "none"}`);
console.log(`Report live eligible: ${hosted.report.liveEligible ? "yes" : "no"}`);
console.log(`Image MIME: ${hosted.imageReview.mimeType}`);
console.log(`Image dimensions: ${hosted.imageReview.width}x${hosted.imageReview.height}`);
console.log(`Image quality: ${hosted.imageReview.qualityScore}/100 ${hosted.imageReview.qualityLabel}`);
console.log(`Metadata valid: ${hosted.metadataValidation.valid ? "yes" : "no"}`);
console.log(`Image errors: ${hosted.imageReview.errors.join(", ") || "none"}`);
console.log(`Metadata errors: ${hosted.metadataValidation.errors.join(", ") || "none"}`);

if (!hosted.metadataValidation.valid) process.exitCode = 1;
if (!hosted.metadataJson.image.startsWith("https://assets.oink.bot/local/metadata_safe/")) process.exitCode = 1;
