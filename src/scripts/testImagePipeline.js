// ============================================================
// Test OINK image asset pipeline
// Run: npm run test-image-pipeline
// ============================================================

import { prepareImageAsset } from "../imageAssetPipeline.js";

const common = {
  launchId: "dry-cluster-spotghost-SPOT",
  clusterId: "cluster-spotghost",
  ticker: "SPOT",
  prompt: "Clean OINK-style internet-native token visual for Spotghost. Source artifact: symbol_artifact; visual plan: isolate_symbol; phrase: spot ghost; emotional texture: awe. Create a bold simple silhouette mark with a clear object identity, sticker-like thumbnail readability, remix potential, high contrast, readable at tiny size.",
  artifact: {
    artifactType: "symbol_artifact",
    sourceArtifactType: "symbol_artifact",
    extractedPhrase: "spot ghost",
    emotionalTexture: "awe",
    identityCompressionSummary: "symbol artifact: spot ghost + awe + screenshot silhouette",
    visualReuseMode: "isolate_symbol",
  },
  narrative: {
    clusterName: "Spotghost",
  },
};

const placeholder = prepareImageAsset(common, { mode: "placeholder" });
const remote = prepareImageAsset(common, {
  mode: "remote_url",
  remoteUrl: "https://example.com/spotghost.png",
});

console.log("Image pipeline test");
printAsset("placeholder", placeholder);
printAsset("remote_url", remote);

function printAsset(label, asset) {
  console.log(`\n${label}`);
  console.log(`State: ${asset.validationStatus}`);
  console.log(`Quality: ${asset.qualityScore}/100`);
  console.log(`Thumbnail: ${asset.visualScore.thumbnailStrengthLabel}`);
  console.log(`Image: ${asset.image || "none"}`);
  console.log(`Valid: ${asset.validation.valid ? "yes" : "no"}`);
  console.log(`Errors: ${asset.validation.errors.join(", ") || "none"}`);
}
