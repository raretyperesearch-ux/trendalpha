import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { config } from "./config.js";

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 256;

export class MetadataUploadProvider {
  constructor(options = {}) {
    this.provider = options.provider || config.metadata.uploadProvider || "dry_wire";
    this.assetBaseUrl = options.assetBaseUrl || config.metadata.assetBaseUrl;
    this.metadataBaseUrl = options.metadataBaseUrl || config.metadata.jsonBaseUrl;
  }

  async uploadImage({ buffer, mimeType, hash, extension, imageAsset }) {
    if (this.provider !== "dry_wire") {
      throw new Error(`Metadata upload provider ${this.provider} is not implemented in dry-wire mode`);
    }

    return {
      provider: this.provider,
      status: "prepared",
      uploaded: false,
      hostedImageUrl: `${this.assetBaseUrl.replace(/\/$/, "")}/${hash}.${extension}`,
      storageKey: `dry-wire/images/${hash}.${extension}`,
      byteSize: buffer.length,
      mimeType,
      sourceImageUrl: imageAsset.imageUrl || imageAsset.image || "",
      note: "Dry-wire upload prepared. No external upload performed.",
    };
  }

  async uploadMetadata({ metadataJson, hash }) {
    if (this.provider !== "dry_wire") {
      throw new Error(`Metadata upload provider ${this.provider} is not implemented in dry-wire mode`);
    }

    return {
      provider: this.provider,
      status: "prepared",
      uploaded: false,
      metadataUrl: `${this.metadataBaseUrl.replace(/\/$/, "")}/${hash}.json`,
      storageKey: `dry-wire/metadata/${hash}.json`,
      byteSize: Buffer.byteLength(JSON.stringify(metadataJson)),
      note: "Dry-wire metadata upload prepared. No external upload performed.",
    };
  }
}

export class PinataMetadataUploadProvider extends MetadataUploadProvider {
  constructor(options = {}) {
    super({ ...options, provider: "pinata_ipfs" });
  }

  async uploadImage() {
    throw new Error("Pinata/IPFS upload provider is a dry-wire interface only; credentials and upload implementation are not enabled");
  }

  async uploadMetadata() {
    throw new Error("Pinata/IPFS metadata upload provider is a dry-wire interface only; credentials and upload implementation are not enabled");
  }
}

export class ArweaveMetadataUploadProvider extends MetadataUploadProvider {
  constructor(options = {}) {
    super({ ...options, provider: "arweave" });
  }

  async uploadImage() {
    throw new Error("Arweave upload provider is a dry-wire interface only; wallet/signing is not enabled");
  }

  async uploadMetadata() {
    throw new Error("Arweave metadata upload provider is a dry-wire interface only; wallet/signing is not enabled");
  }
}

export class PumpPortalMetadataUploadProvider extends MetadataUploadProvider {
  constructor(options = {}) {
    super({ ...options, provider: "pumpportal" });
  }

  async uploadImage() {
    throw new Error("PumpPortal upload endpoint provider is a dry-wire interface only; live upload is not enabled");
  }

  async uploadMetadata() {
    throw new Error("PumpPortal metadata upload provider is a dry-wire interface only; live upload is not enabled");
  }
}

export function createMetadataUploadProvider(options = {}) {
  const provider = options.provider || config.metadata.uploadProvider || "dry_wire";
  if (provider === "pinata" || provider === "pinata_ipfs") return new PinataMetadataUploadProvider(options);
  if (provider === "arweave") return new ArweaveMetadataUploadProvider(options);
  if (provider === "pumpportal" || provider === "pumpportal_upload") return new PumpPortalMetadataUploadProvider(options);
  return new MetadataUploadProvider({ ...options, provider });
}

export class ImageDownloadRehostPipeline {
  constructor(options = {}) {
    this.downloadRemoteImages = options.downloadRemoteImages ?? config.metadata.downloadRemoteImages;
    this.liveMode = options.liveMode ?? Boolean(options.enableRealLaunches);
    this.strictMode = options.strictMode ?? config.metadata.liveStrictMode;
    this.uploadProvider = options.uploadProvider || createMetadataUploadProvider(options);
  }

  async prepare({ deploymentAttempt }) {
    const metadata = deploymentAttempt.payload?.metadata || {};
    const imageAsset = metadata.imageUpload || {};
    const download = await this.downloadImageAsset(imageAsset);
    const imageReview = reviewImageBytes(download, imageAsset);
    const imageValidation = validateImageReview(imageReview, {
      liveMode: this.liveMode,
      strictMode: this.strictMode,
    });

    let upload = null;
    if (imageValidation.valid) {
      upload = await this.uploadProvider.uploadImage({
        buffer: download.buffer,
        mimeType: imageReview.mimeType,
        hash: imageReview.hash,
        extension: imageReview.extension,
        imageAsset,
      });
    }

    const metadataJson = buildPumpPortalMetadataJson({
      metadata,
      deploymentAttempt,
      hostedImageUrl: upload?.hostedImageUrl || "",
      imageReview,
    });
    const metadataValidation = validatePumpPortalMetadataJson(metadataJson, {
      liveMode: this.liveMode,
      strictMode: this.strictMode,
      imageReview,
      imageUpload: upload,
    });

    let metadataUpload = null;
    if (metadataValidation.valid) {
      metadataUpload = await this.uploadProvider.uploadMetadata({
        metadataJson,
        hash: hashText(JSON.stringify(metadataJson)),
      });
    }

    const report = buildMetadataDryRunReport({
      metadataJson,
      metadataUpload,
      imageUpload: upload,
      imageAsset,
      imageReview,
      metadataValidation,
      liveMode: this.liveMode,
      strictMode: this.strictMode,
    });

    return {
      state: metadataValidation.valid ? "metadata_hosted_ready" : "metadata_hosting_failed",
      imageReview,
      imageValidation,
      imageUpload: upload,
      metadataJson,
      metadataValidation,
      metadataUpload,
      report,
      launchAsset: {
        ...imageAsset,
        imageUrl: upload?.hostedImageUrl || "",
        uploadedImageUrl: upload?.hostedImageUrl || "",
        metadataUrl: metadataUpload?.metadataUrl || "",
        mimeType: imageReview.mimeType,
        byteSize: imageReview.byteSize,
        width: imageReview.width,
        height: imageReview.height,
        imageQualityReview: imageReview,
        liveEligible: report.liveEligible,
        liveEligibilityReasons: report.liveEligibilityReasons,
        validationStatus: metadataValidation.valid ? "metadata_ready" : "validation_failed",
      },
      createdAt: new Date().toISOString(),
    };
  }

  async downloadImageAsset(imageAsset) {
    if (imageAsset.localPath) {
      const buffer = await fs.readFile(path.resolve(imageAsset.localPath));
      return { buffer, source: "local_path", url: imageAsset.localPath };
    }

    const imageUrl = imageAsset.imageUrl || imageAsset.image;
    if (!imageUrl) throw new Error("No image URL or local path available for metadata asset");
    if (!isHttpsUrl(imageUrl)) throw new Error("Metadata asset image URL must be HTTPS before rehosting");
    if (!this.downloadRemoteImages) {
      return createDryWirePlaceholderBytes(imageAsset);
    }

    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "OINK metadata dry-wire asset review/1.0",
      },
    });
    if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), source: "remote_url", url: imageUrl };
  }
}

export async function prepareHostedPumpPortalMetadata(deploymentAttempt, options = {}) {
  const liveMode = options.liveMode ?? (deploymentAttempt.mode === "LIVE_DISABLED_SKELETON" || deploymentAttempt.payload?.mode === "live_skeleton");
  return new ImageDownloadRehostPipeline({ ...options, liveMode }).prepare({ deploymentAttempt });
}

export function buildPumpPortalMetadataJson({ metadata = {}, deploymentAttempt = {}, hostedImageUrl = "", imageReview = {} }) {
  return {
    name: metadata.name || deploymentAttempt.payload?.token?.name || "",
    symbol: metadata.symbol || deploymentAttempt.ticker || "",
    description: metadata.description || deploymentAttempt.payload?.token?.description || "",
    image: hostedImageUrl,
    twitter: metadata.twitter || "",
    telegram: metadata.telegram || "",
    website: metadata.website || "",
    attributes: [
      { trait_type: "OINK Narrative", value: metadata.narrativeSummary || "" },
      { trait_type: "Identity Archetype", value: metadata.identityArchetype || "trendwave" },
      { trait_type: "Source Backlink", value: metadata.sourceBacklink || "" },
      { trait_type: "Image MIME", value: imageReview.mimeType || "" },
      { trait_type: "Image Quality", value: imageReview.qualityLabel || "UNKNOWN" },
    ],
    oink: {
      narrativeSummary: metadata.narrativeSummary || "",
      sourceBacklink: metadata.sourceBacklink || "",
      identityArchetype: metadata.identityArchetype || "trendwave",
      sloganFragments: metadata.sloganFragments || [],
      imageReview,
      dryWire: !imageReview.liveMode,
      liveEligible: Boolean(imageReview.liveEligible),
    },
  };
}

export function validatePumpPortalMetadataJson(metadataJson = {}, { liveMode = false, strictMode = false, imageReview = {}, imageUpload = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!metadataJson.name || metadataJson.name.length > 32) errors.push("metadata_name_invalid");
  if (!metadataJson.symbol || metadataJson.symbol.length > 10) errors.push("metadata_symbol_invalid");
  if (!metadataJson.description || metadataJson.description.length > 500) errors.push("metadata_description_invalid");
  if (!metadataJson.image || !isHttpsUrl(metadataJson.image)) errors.push("hosted_image_url_missing_or_invalid");
  if (!metadataJson.oink?.sourceBacklink) warnings.push("source_backlink_missing");
  if (liveMode && strictMode && imageReview.source === "dry_wire_synthetic_download") errors.push("live_mode_rejects_synthetic_image");
  if (liveMode && strictMode && !["remote_url", "local_path"].includes(imageReview.source)) errors.push("live_mode_requires_real_image_source");
  if (liveMode && strictMode && (!imageUpload || imageUpload.provider === "dry_wire" || !imageUpload.uploaded)) {
    errors.push("live_mode_requires_real_upload_provider");
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function reviewImageBytes(download, imageAsset = {}) {
  const buffer = download.buffer;
  const detected = detectImage(buffer);
  const hash = hashBuffer(buffer);
  const aspectRatio = detected.width && detected.height ? detected.width / detected.height : 0;
  const errors = [];
  const warnings = [];

  if (!SUPPORTED_MIME_TYPES.has(detected.mimeType)) errors.push("unsupported_mime_type");
  if (buffer.length > MAX_IMAGE_BYTES) errors.push("image_too_large");
  if (detected.width && detected.width < MIN_DIMENSION) errors.push("image_width_too_small");
  if (detected.height && detected.height < MIN_DIMENSION) errors.push("image_height_too_small");
  if (!detected.width || !detected.height) warnings.push("dimensions_unavailable");
  if (aspectRatio && (aspectRatio < 0.45 || aspectRatio > 2.2)) warnings.push("aspect_ratio_extreme");
  if (imageAsset.assetType === "placeholder") errors.push("placeholder_not_rehostable");

  const score = clampScore(
    45 +
    (SUPPORTED_MIME_TYPES.has(detected.mimeType) ? 20 : 0) +
    (detected.width >= 512 && detected.height >= 512 ? 20 : 0) +
    (buffer.length >= 2048 ? 10 : 0) +
    (aspectRatio >= 0.75 && aspectRatio <= 1.35 ? 5 : 0) -
    errors.length * 20 -
    warnings.length * 5
  );

  return {
    source: download.source,
    originalUrl: download.url,
    mimeType: detected.mimeType,
    extension: detected.extension,
    byteSize: buffer.length,
    width: detected.width,
    height: detected.height,
    aspectRatio: aspectRatio ? Number(aspectRatio.toFixed(3)) : 0,
    hash,
    qualityScore: score,
    qualityLabel: score >= 80 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW",
    liveEligibleSource: ["remote_url", "local_path"].includes(download.source),
    liveMode: false,
    liveEligible: false,
    errors,
    warnings,
  };
}

function validateImageReview(review, { liveMode = false, strictMode = false } = {}) {
  const errors = [...review.errors];
  const warnings = [...review.warnings];
  if (liveMode && strictMode && review.source === "dry_wire_synthetic_download") errors.push("live_mode_rejects_synthetic_download");
  if (liveMode && strictMode && !review.liveEligibleSource) errors.push("live_mode_requires_actual_downloaded_or_generated_image");
  review.liveMode = Boolean(liveMode);
  review.liveEligible = errors.length === 0 && review.qualityScore >= 55 && review.liveEligibleSource;
  return {
    valid: errors.length === 0 && review.qualityScore >= 55,
    errors,
    warnings,
  };
}

export function buildMetadataDryRunReport({
  metadataJson = {},
  metadataUpload = null,
  imageUpload = null,
  imageAsset = {},
  imageReview = {},
  metadataValidation = {},
  liveMode = false,
  strictMode = false,
} = {}) {
  const reasons = [];
  if (!metadataValidation.valid) reasons.push(...(metadataValidation.errors || []));
  if (!imageReview.liveEligibleSource) reasons.push("image_source_not_live_eligible");
  if (imageReview.source === "dry_wire_synthetic_download") reasons.push("synthetic_dry_wire_image");
  if (!imageUpload || imageUpload.provider === "dry_wire" || !imageUpload.uploaded) reasons.push("not_uploaded_to_real_provider");
  const liveEligible = reasons.length === 0;
  return {
    finalImageUrl: metadataJson.image || "",
    metadataUrl: metadataUpload?.metadataUrl || "",
    imageSource: imageAsset.imageSource || imageReview.source || "",
    imageReviewSource: imageReview.source || "",
    uploadProvider: imageUpload?.provider || "",
    uploadStatus: imageUpload?.status || "not_prepared",
    strictMode: Boolean(strictMode),
    liveMode: Boolean(liveMode),
    liveEligible,
    liveEligibilityReasons: reasons,
  };
}

function detectImage(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      mimeType: "image/png",
      extension: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "GIF") {
    return {
      mimeType: "image/gif",
      extension: "gif",
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return detectWebp(buffer);
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return detectJpeg(buffer);
  }
  return { mimeType: "application/octet-stream", extension: "bin", width: 0, height: 0 };
}

function detectJpeg(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { mimeType: "image/jpeg", extension: "jpg", width: 0, height: 0 };
}

function detectWebp(buffer) {
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return { mimeType: "image/webp", extension: "webp", width: 0, height: 0 };
}

function createDryWirePlaceholderBytes(imageAsset) {
  const seed = `${imageAsset.launchId || ""}:${imageAsset.ticker || ""}:${imageAsset.imageUrl || imageAsset.image || ""}`;
  const hash = hashText(seed);
  return {
    buffer: createSyntheticPng(hash),
    source: "dry_wire_synthetic_download",
    url: imageAsset.imageUrl || imageAsset.image || "",
  };
}

function createSyntheticPng(hash) {
  const width = 512;
  const height = 512;
  const color = Buffer.from(hash.slice(0, 6), "hex");
  const header = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = pngChunk("IHDR", Buffer.concat([
    uint32(width),
    uint32(height),
    Buffer.from([8, 2, 0, 0, 0]),
  ]));
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 3;
      raw[index] = color[0];
      raw[index + 1] = color[1];
      raw[index + 2] = color[2];
    }
  }
  const idat = pngChunk("IDAT", deflateSync(raw));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([header, ihdr, idat, iend]);
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
  } catch (_) {
    return false;
  }
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}
