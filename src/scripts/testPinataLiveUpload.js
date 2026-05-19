// ============================================================
// Standalone Pinata live upload smoke test
// Run: npm run test-pinata-live-upload
// ============================================================

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { deflateSync } from "node:zlib";

setRequiredEnv();

const { PinataMetadataUploadProvider } = await import("../metadataAssets.js");

if (!process.env.PINATA_JWT?.trim()) {
  console.error("PINATA_JWT is required for test-pinata-live-upload");
  process.exit(1);
}

const provider = new PinataMetadataUploadProvider({ pinataJwt: process.env.PINATA_JWT });
if (provider.provider !== "pinata_ipfs") {
  console.error(`Expected pinata provider, got ${provider.provider || "unknown"}`);
  process.exit(1);
}

const image = await loadTestImage();
const imageHash = hashBuffer(image.buffer);
const imageUpload = await provider.uploadImage({
  buffer: image.buffer,
  mimeType: image.mimeType,
  hash: imageHash,
  extension: image.extension,
  imageAsset: {
    imageUrl: image.source,
    image: image.source,
  },
});

const metadataJson = {
  name: "OINK Upload Test",
  symbol: "OINKTEST",
  image: imageUpload.imageUri || imageUpload.hostedImageUrl,
  description: "Pinata upload smoke test",
  twitter: "",
  telegram: "",
  website: "",
};
const metadataUpload = await provider.uploadMetadata({
  metadataJson,
  hash: hashText(JSON.stringify(metadataJson)),
});

const imageCid = imageUpload.imageCid || imageUpload.cid;
const imageUri = imageUpload.imageUri || imageUpload.hostedImageUrl;
const metadataCid = metadataUpload.metadataCid || metadataUpload.cid;
const metadataUri = metadataUpload.metadataUri || metadataUpload.metadataUrl;

console.log("Pinata live upload smoke test");
console.log(`image_cid=${imageCid}`);
console.log(`image_uri=${imageUri}`);
console.log(`metadata_cid=${metadataCid}`);
console.log(`metadata_uri=${metadataUri}`);

if (!imageCid || !imageUri?.startsWith("https://ipfs.io/ipfs/")) process.exitCode = 1;
if (!metadataCid || !metadataUri?.startsWith("https://ipfs.io/ipfs/")) process.exitCode = 1;

async function loadTestImage() {
  if (process.env.TEST_IMAGE_URL?.trim()) {
    const url = process.env.TEST_IMAGE_URL.trim();
    if (!isHttpsUrl(url)) throw new Error("TEST_IMAGE_URL must be HTTPS");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TEST_IMAGE_URL download failed: ${res.status}`);
    const contentType = res.headers.get("content-type")?.split(";")[0] || "image/png";
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mimeType: contentType,
      extension: extensionFromMime(contentType),
      source: url,
    };
  }

  if (process.env.TEST_IMAGE_LOCAL_PATH?.trim()) {
    const localPath = process.env.TEST_IMAGE_LOCAL_PATH.trim();
    const buffer = await fs.readFile(localPath);
    const extension = localPath.split(".").pop()?.toLowerCase() || "png";
    return {
      buffer,
      mimeType: mimeFromExtension(extension),
      extension,
      source: localPath,
    };
  }

  return {
    buffer: createSyntheticPng("OINK Upload Test"),
    mimeType: "image/png",
    extension: "png",
    source: "generated_test_png",
  };
}

function setRequiredEnv() {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
}

function createSyntheticPng(seed, size = 256) {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  const color = Buffer.from(hash.slice(0, 6), "hex");
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
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
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

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 24);
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

function isHttpsUrl(url) {
  try {
    return new URL(String(url || "")).protocol === "https:";
  } catch {
    return false;
  }
}

function extensionFromMime(mimeType = "") {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function mimeFromExtension(extension = "") {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/png";
}
