// ============================================================
// Test OINK hosted asset pipeline
// Run: npm run test-hosted-assets
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { prepareDryRunPumpPortalLaunch } from "../launchers/dryRunPumpPortalProvider.js";
import { preparePumpPortalDeployment, preparePumpPortalMetadataPackage } from "../launchers/pumpPortalProvider.js";
import { formatHostedAssetDiagnostics } from "../telegram.js";

const tmpDir = path.resolve(".tmp-hosted-assets");
const sourceImage = path.join(tmpDir, "source.png");
const hostedDir = path.join(tmpDir, "hosted");
await fs.mkdir(tmpDir, { recursive: true });
await fs.writeFile(sourceImage, createPng("a17cff", 512));

const cluster = {
  clusterId: "cluster-hosted-assets",
  canonicalEntity: "Spotghost",
  lifecycleState: "forming",
  launchWindow: "PRIME_WINDOW",
  launchReadiness: 88,
  swarmPressure: 10,
  identityFormationScore: 91,
  memeticArtifact: {
    artifactType: "symbol_artifact",
    artifactStrength: 86,
    visualReuseMode: "reuse_source_media",
    extractedPhrase: "spot ghost",
    emotionalTexture: "eerie awe",
    suggestedTicker: "SPOT",
    tokenIdentity: "Spotghost",
    identityCompressionSummary: "symbol artifact: spot ghost + eerie awe + sticker silhouette",
  },
  sourceArtifactType: "symbol_artifact",
  artifactStrength: 86,
  visualReuseMode: "reuse_source_media",
  extractedPhrase: "spot ghost",
  emotionalTexture: "eerie awe",
  identityCompressionSummary: "symbol artifact: spot ghost + eerie awe + sticker silhouette",
  artifactSuggestedTicker: "SPOT",
  relatedPosts: [{ sourcePlatform: "x", sourceUrl: "https://x.com/example/status/999" }],
  relatedPhrases: ["spot ghost"],
};

const shadowLaunch = prepareDryRunPumpPortalLaunch(cluster);
const deploymentAttempt = preparePumpPortalDeployment(shadowLaunch, {
  imageOptions: {
    mode: "local_generated_asset",
    localPath: sourceImage,
  },
});
const hosted = await preparePumpPortalMetadataPackage(deploymentAttempt, {
  assetHosting: {
    provider: "local",
    localDir: hostedDir,
    baseUrl: "https://assets.oink.bot/test",
  },
});

deploymentAttempt.payload.hostedMetadata = hosted;
deploymentAttempt.payload.metadata.image = hosted.metadataJson.image;
deploymentAttempt.payload.metadata.hostedMetadataUrl = hosted.metadataUpload?.metadataUrl || "";
deploymentAttempt.payload.metadata.imageUpload = hosted.launchAsset;

console.log("Hosted assets test");
console.log(`State: ${hosted.state}`);
console.log(`Hosted image: ${hosted.launchAsset.uploadedImageUrl}`);
console.log(`Thumbnail: ${hosted.launchAsset.thumbnailUrl}`);
console.log(`Metadata URL: ${hosted.launchAsset.metadataUrl}`);
console.log(`Hash: ${hosted.launchAsset.hash}`);
console.log(`Provider: ${hosted.launchAsset.uploadProvider}`);
console.log(`Upload status: ${hosted.launchAsset.uploadStatus}`);
console.log(`Frozen: ${hosted.launchAsset.metadataFrozen ? "yes" : "no"}`);
console.log(`Meme readability: ${hosted.launchAsset.artifactScore.memeReadabilityLabel}`);
console.log(`Thumbnail strength: ${hosted.launchAsset.artifactScore.thumbnailStrengthLabel}`);
console.log("\nTelegram preview:");
console.log(formatHostedAssetDiagnostics(deploymentAttempt));

const expectedFiles = [
  hosted.hostedAssets.original.localPath,
  hosted.hostedAssets.metadataSafe.localPath,
  hosted.hostedAssets.thumbnail.localPath,
  hosted.metadataUpload.localPath,
];
for (const file of expectedFiles) {
  try {
    await fs.access(file);
  } catch (_) {
    console.error(`Missing hosted file: ${file}`);
    process.exitCode = 1;
  }
}
if (!hosted.metadataValidation.valid) process.exitCode = 1;
if (!hosted.frozenPackage?.packageHash) process.exitCode = 1;
if (!hosted.launchAsset.thumbnailUrl) process.exitCode = 1;

function createPng(hexColor, size) {
  const color = Buffer.from(hexColor, "hex");
  const header = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = pngChunk("IHDR", Buffer.concat([
    uint32(size),
    uint32(size),
    Buffer.from([8, 2, 0, 0, 0]),
  ]));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 3;
      raw[index] = color[0];
      raw[index + 1] = color[1];
      raw[index + 2] = color[2];
    }
  }
  return Buffer.concat([
    header,
    ihdr,
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
