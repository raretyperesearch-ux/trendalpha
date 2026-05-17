// ============================================================
// Test OINK launch adapter architecture
// Run: npm run test-launch-adapter
// ============================================================

import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { PumpPortalProvider } from "../launchers/pumpPortalProvider.js";
import { formatDeploymentAdapterAlert } from "../telegram.js";

const cluster = {
  clusterId: "cluster-adapter-test",
  canonicalEntity: "Banana Dog",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  launchReadiness: 86,
  swarmPressure: 12,
  identityFormationScore: 90,
  memeticArtifact: {
    artifactType: "mascot_artifact",
    artifactStrength: 84,
    visualReuseMode: "reuse_source_media",
    extractedPhrase: "banana dog",
    emotionalTexture: "absurd joy",
    suggestedTicker: "BANANADOG",
    tokenIdentity: "Banana Dog",
    identityCompressionSummary: "mascot artifact: banana dog + absurd joy + sticker silhouette",
  },
  sourceArtifactType: "mascot_artifact",
  artifactStrength: 84,
  visualReuseMode: "reuse_source_media",
  extractedPhrase: "banana dog",
  emotionalTexture: "absurd joy",
  identityCompressionSummary: "mascot artifact: banana dog + absurd joy + sticker silhouette",
  artifactSuggestedTicker: "BANANADOG",
  relatedPosts: [{ sourcePlatform: "x", sourceUrl: "https://x.com/example/status/777" }],
  relatedPhrases: ["banana dog"],
};

const adapter = new PumpPortalProvider({
  imageOptions: {
    mode: "remote_url",
    remoteUrl: "https://example.com/adapter.png",
  },
});
const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = adapter.prepareDeployment(shadowLaunch);

const cases = [
  ["valid", true, null],
  ["missing_transaction", false, "schema_mismatch"],
  ["renamed_fields", false, "schema_mismatch"],
  ["malformed", false, "schema_mismatch"],
  ["upload_failure", false, "asset_upload_failure"],
];

console.log("Launch adapter test");
console.log(`Provider: ${deploymentAttempt.adapter.provider}`);
console.log(`Compatibility: ${deploymentAttempt.adapter.compatibility.status}`);
console.log(`Dry wire: ${deploymentAttempt.adapter.capabilities.dryWireSupport ? "yes" : "no"}`);
console.log(`Broadcast: ${deploymentAttempt.adapter.capabilities.broadcast ? "yes" : "no"}`);

for (const [mutation, expectedValid, expectedFailure] of cases) {
  const result = adapter.runSimulationHarness({
    mutation,
    payload: deploymentAttempt.payload,
    validation: deploymentAttempt.validation,
  });
  console.log(`${mutation}: valid=${result.parsed.valid ? "yes" : "no"} failure=${result.failureClass || "none"} state=${result.deploymentState}`);
  if (result.parsed.valid !== expectedValid) process.exitCode = 1;
  if (expectedFailure && result.failureClass !== expectedFailure) process.exitCode = 1;
  if (expectedValid && result.deploymentState !== "simulated") process.exitCode = 1;
  if (!result.preservedState) process.exitCode = 1;
}

console.log("\nTelegram adapter diagnostic preview:");
console.log(formatDeploymentAdapterAlert(deploymentAttempt));
