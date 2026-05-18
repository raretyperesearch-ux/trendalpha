// ============================================================
// Test deployment metadata failure stays scan-safe
// Run: npm run test-deployment-metadata-failure
// ============================================================

import { Keypair } from "@solana/web3.js";

const deploy = Keypair.generate();
process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.ENABLE_REAL_LAUNCHES = "true";
process.env.SIGNER_DISABLED = "true";
process.env.DEPLOY_WALLET_PUBLIC_KEY = deploy.publicKey.toBase58();
process.env.PINATA_JWT = "";
process.env.LIVE_METADATA_STRICT_MODE = "true";

const { prepareDryRunPumpPortalLaunch } = await import("../launchers/dryRunPumpPortalProvider.js");
const { prepareAndPersistDeploymentAttempt } = await import("../deployments.js");

const cluster = {
  clusterId: "cluster-metadata-failure",
  canonicalEntity: "Banana Dog",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  launchReadiness: 88,
  swarmPressure: 10,
  saturationPressure: 12,
  identityFormationScore: 92,
  propagationPersistence: 86,
  remixGrowthRate: 70,
  quoteChainExpansion: 64,
  artifactStrength: 88,
  sourceArtifactType: "mascot_artifact",
  visualReuseMode: "reuse_source_media",
  extractedPhrase: "banana dog",
  emotionalTexture: "absurd joy",
  identityCompressionSummary: "source image mascot artifact",
  memeticArtifact: {
    artifactType: "mascot_artifact",
    artifactStrength: 88,
    visualReuseMode: "reuse_source_media",
    extractedPhrase: "banana dog",
    emotionalTexture: "absurd joy",
    suggestedTicker: "BANANADOG",
    tokenIdentity: "Banana Dog",
    identityCompressionSummary: "source image mascot artifact",
  },
  relatedPosts: [{
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/metadata-fail",
    author: "example",
    sourceMediaUrl: "https://pbs.twimg.com/media/missing.jpg",
    sourceMediaType: "photo",
    sourceMedia: {
      preferred: {
        sourceMediaUrl: "https://pbs.twimg.com/media/missing.jpg",
        url: "https://pbs.twimg.com/media/missing.jpg",
        mediaType: "photo",
        width: 1200,
        height: 900,
      },
      validation: { valid: true, errors: [], warnings: [] },
    },
  }],
  relatedPhrases: ["banana dog"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const attempt = await prepareAndPersistDeploymentAttempt(shadowLaunch, {
  sendTelegram: false,
});

console.log("Deployment metadata failure test");
console.log(`State: ${attempt.deploymentState}`);
console.log(`Failure class: ${attempt.failure?.failureClass || attempt.failureClass || "none"}`);
console.log(`Failure reason: ${attempt.failure?.reason || "none"}`);

if (attempt.deploymentState !== "failed") process.exitCode = 1;
if ((attempt.failure?.failureClass || attempt.failureClass) !== "metadata_failure") process.exitCode = 1;
