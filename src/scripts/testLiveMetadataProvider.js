// ============================================================
// Test live mode auto-selects Pinata metadata provider
// Run: npm run test-live-metadata-provider
// ============================================================

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

const deploy = Keypair.generate();
process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.ENABLE_REAL_LAUNCHES = "true";
process.env.SIGNER_DISABLED = "true";
process.env.DEPLOY_WALLET_PUBLIC_KEY = deploy.publicKey.toBase58();
process.env.PINATA_JWT = "test-pinata-jwt";
process.env.LIVE_METADATA_STRICT_MODE = "true";
process.env.METADATA_UPLOAD_PROVIDER = "pinata";
process.env.ASSET_HOSTING_PROVIDER = "pinata";

const { prepareHostedPumpPortalMetadata } = await import("../metadataAssets.js");

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: { cid: `bafy-test-${Math.random().toString(36).slice(2, 8)}` } }),
});

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "oink-live-provider-"));
const imagePath = path.join(tmpDir, "source.png");
await fs.writeFile(imagePath, createFakePng({ width: 512, height: 512, bytes: 4096 }));

const deploymentAttempt = {
  attemptId: "deploy-live-provider-test",
  clusterId: "cluster-live-provider-test",
  ticker: "BANANADOG",
  mode: "LIVE_DISABLED_SKELETON",
  payload: {
    token: {
      name: "Banana Dog",
      symbol: "BANANADOG",
      description: "A source-first OINK narrative formed from viral internet attention.",
    },
    metadata: {
      sourceBacklink: "https://x.com/example/status/123",
      narrativeSummary: "Banana Dog is a source-first viral artifact.",
      identityArchetype: "mascot",
      sloganFragments: ["banana dog", "absurd joy"],
      imageUpload: {
        launchId: "launch-live-provider-test",
        clusterId: "cluster-live-provider-test",
        ticker: "BANANADOG",
        assetType: "source_image",
        localPath: imagePath,
        imageSource: "SOURCE POST MEDIA",
        sourcePostUrl: "https://x.com/example/status/123",
        sourceBacklink: "https://x.com/example/status/123",
        validationStatus: "image_ready",
        qualityScore: 88,
      },
    },
  },
};

try {
  const hosted = await prepareHostedPumpPortalMetadata(deploymentAttempt);
  console.log("Live metadata provider test");
  console.log(`Provider: ${hosted.report.uploadProvider}`);
  console.log(`Hosted ready: ${hosted.metadataValidation.valid ? "yes" : "no"}`);
  console.log(`Image URL: ${hosted.metadataJson.image}`);
  console.log(`Metadata URL: ${hosted.metadataUpload?.metadataUrl || "none"}`);

  if (hosted.report.uploadProvider !== "pinata_ipfs") process.exitCode = 1;
  if (!hosted.metadataValidation.valid) process.exitCode = 1;
  if (!hosted.metadataJson.image.startsWith("https://ipfs.io/ipfs/")) process.exitCode = 1;
  if (!hosted.metadataUpload?.metadataUrl?.startsWith("https://ipfs.io/ipfs/")) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await fs.rm(tmpDir, { recursive: true, force: true });
}

function createFakePng({ width, height, bytes }) {
  const buffer = Buffer.alloc(bytes, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  Buffer.from("IHDR").copy(buffer, 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  return buffer;
}
