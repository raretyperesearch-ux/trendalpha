import crypto from "node:crypto";
import { Blob } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { config } from "./config.js";
import { createAssetHostingProvider } from "./assetHosting.js";

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 256;

export class MetadataUploadProvider {
  constructor(options = {}) {
    this.provider = options.provider || config.metadata.uploadProvider || "dry_wire";
    this.assetBaseUrl = options.assetBaseUrl || config.metadata.assetBaseUrl;
    this.metadataBaseUrl = options.metadataBaseUrl || config.metadata.jsonBaseUrl;
  }

  async uploadImage({ buffer, mimeType, hash, extension, imageAsset, hostedImageUrl = "" }) {
    if (this.provider !== "dry_wire") {
      throw new Error(`Metadata upload provider ${this.provider} is not implemented in dry-wire mode`);
    }

    return {
      provider: this.provider,
      status: "prepared",
      uploaded: false,
      hostedImageUrl: hostedImageUrl || `${this.assetBaseUrl.replace(/\/$/, "")}/${hash}.${extension}`,
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
    this.jwt = options.pinataJwt || process.env.PINATA_JWT || "";
    this.uploadUrl = options.uploadUrl || config.pinata.uploadUrl;
  }

  async uploadImage({ buffer, mimeType, hash, extension, imageAsset }) {
    const uploaded = await this.uploadPinataFile({
      filename: `${hash}.${extension || extensionFromMime(mimeType)}`,
      contentType: mimeType,
      buffer,
    });
    return {
      provider: this.provider,
      status: "uploaded",
      uploaded: true,
      hostedImageUrl: `https://ipfs.io/ipfs/${uploaded.cid}`,
      cid: uploaded.cid,
      storageKey: uploaded.cid,
      byteSize: buffer.length,
      mimeType,
      sourceImageUrl: imageAsset.imageUrl || imageAsset.image || "",
      note: "Uploaded image to Pinata/IPFS.",
    };
  }

  async uploadMetadata({ metadataJson, hash }) {
    const buffer = Buffer.from(JSON.stringify(metadataJson, null, 2));
    const uploaded = await this.uploadPinataFile({
      filename: `${hash}.json`,
      contentType: "application/json",
      buffer,
    });
    return {
      provider: this.provider,
      status: "uploaded",
      uploaded: true,
      metadataUrl: `https://ipfs.io/ipfs/${uploaded.cid}`,
      cid: uploaded.cid,
      storageKey: uploaded.cid,
      byteSize: buffer.length,
      note: "Uploaded metadata JSON to Pinata/IPFS.",
    };
  }

  async uploadPinataFile({ filename, contentType, buffer }) {
    if (!this.jwt) throw new Error("pinata_jwt_missing");
    const form = new FormData();
    form.append("network", "public");
    form.append("file", new Blob([buffer], { type: contentType }), filename);
    const res = await fetch(this.uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.jwt}`,
      },
      body: form,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      throw new Error(`Pinata upload failed: ${res.status} ${body?.error || body?.message || res.statusText || ""}`.trim());
    }
    const cid = body?.data?.cid || body?.cid || body?.IpfsHash;
    if (!cid) throw new Error("Pinata upload response missing CID");
    return { cid, body };
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
    this.assetHostingProvider = options.assetHostingProvider || createAssetHostingProvider(options.assetHosting || options);
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
    const optimized = optimizeImageArtifacts({ download, imageReview, imageAsset });
    const artifactScore = scoreImageArtifact({ imageReview, imageAsset, optimized });
    imageReview.artifactScore = artifactScore;

    let upload = null;
    let hostedAssets = null;
    if (imageValidation.valid) {
      hostedAssets = await this.hostOptimizedAssets({ optimized, imageReview, imageAsset });
      const metadataSafe = hostedAssets.metadataSafe || hostedAssets.original;
      upload = await this.uploadProvider.uploadImage({
        buffer: optimized.metadataSafe.buffer,
        mimeType: imageReview.mimeType,
        hash: imageReview.hash,
        extension: optimized.metadataSafe.extension,
        imageAsset,
        hostedImageUrl: metadataSafe?.url,
      });
      if (metadataSafe?.url && upload.provider === "dry_wire") upload.hostedImageUrl = metadataSafe.url;
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
      const metadataHash = hashText(JSON.stringify(metadataJson));
      if (this.uploadProvider.provider === "pinata_ipfs") {
        metadataUpload = await this.uploadProvider.uploadMetadata({ metadataJson, hash: metadataHash });
      } else {
        metadataUpload = await this.assetHostingProvider.uploadAsset({
          buffer: Buffer.from(JSON.stringify(metadataJson, null, 2)),
          filename: `${metadataHash}.json`,
          contentType: "application/json",
          kind: "metadata",
          hash: metadataHash,
        });
        metadataUpload.metadataUrl = metadataUpload.url;
      }
    }

    const report = buildMetadataDryRunReport({
      metadataJson,
      metadataUpload,
      imageUpload: upload,
      hostedAssets,
      imageAsset,
      imageReview,
      metadataValidation,
      liveMode: this.liveMode,
      strictMode: this.strictMode,
    });
    const frozenPackage = metadataValidation.valid
      ? freezeMetadataPackage({ metadataJson, metadataUpload, hostedAssets, imageReview, report })
      : null;

    return {
      state: metadataValidation.valid ? "metadata_hosted_ready" : "metadata_hosting_failed",
      imageReview,
      artifactScore,
      imageValidation,
      imageUpload: upload,
      hostedAssets,
      metadataJson,
      metadataValidation,
      metadataUpload,
      report,
      frozenPackage,
      launchAsset: {
        ...imageAsset,
        imageUrl: upload?.hostedImageUrl || "",
        uploadedImageUrl: upload?.hostedImageUrl || "",
        thumbnailUrl: hostedAssets?.thumbnail?.url || "",
        metadataUrl: metadataUpload?.metadataUrl || "",
        metadataFrozen: Boolean(frozenPackage),
        frozenPackageHash: frozenPackage?.packageHash || "",
        hash: imageReview.hash,
        uploadProvider: hostedAssets?.provider || upload?.provider || "",
        uploadStatus: hostedAssets?.status || upload?.status || "not_prepared",
        mimeType: imageReview.mimeType,
        byteSize: imageReview.byteSize,
        width: imageReview.width,
        height: imageReview.height,
        imageQualityReview: imageReview,
        artifactScore,
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

  async hostOptimizedAssets({ optimized, imageReview }) {
    const uploads = {};
    for (const artifact of [optimized.original, optimized.metadataSafe, optimized.square, optimized.thumbnail]) {
      uploads[artifact.kind] = await this.assetHostingProvider.uploadAsset({
        buffer: artifact.buffer,
        filename: artifact.filename,
        contentType: artifact.mimeType,
        kind: artifact.kind,
        hash: artifact.hash,
      });
    }
    return {
      provider: this.assetHostingProvider.provider,
      capabilities: this.assetHostingProvider.capabilities(),
      status: Object.values(uploads).every((item) => item.uploaded || item.status === "prepared") ? "uploaded" : "partial",
      hash: imageReview.hash,
      original: uploads.original,
      metadataSafe: uploads.metadata_safe,
      square: uploads.square,
      thumbnail: uploads.thumbnail,
    };
  }
}

export async function prepareHostedPumpPortalMetadata(deploymentAttempt, options = {}) {
  const liveMode = options.liveMode ?? (deploymentAttempt.mode === "LIVE_DISABLED_SKELETON" || deploymentAttempt.payload?.mode === "live_skeleton");
  const provider = options.provider || (liveMode && config.pinata.jwtPresent ? "pinata" : undefined);
  return new ImageDownloadRehostPipeline({ ...options, provider, liveMode }).prepare({ deploymentAttempt });
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
      { trait_type: "Thumbnail Strength", value: imageReview.artifactScore?.thumbnailStrengthLabel || "UNKNOWN" },
      { trait_type: "Meme Readability", value: imageReview.artifactScore?.memeReadabilityLabel || "UNKNOWN" },
    ],
    oink: {
      narrativeSummary: metadata.narrativeSummary || "",
      sourceBacklink: metadata.sourceBacklink || "",
      identityArchetype: metadata.identityArchetype || "trendwave",
      sloganFragments: metadata.sloganFragments || [],
      imageReview,
      artifactScore: imageReview.artifactScore || {},
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
  if (!detected.width || !detected.height) errors.push("image_dimensions_missing_or_corrupt");
  if (detected.width && detected.width < MIN_DIMENSION) errors.push("image_width_too_small");
  if (detected.height && detected.height < MIN_DIMENSION) errors.push("image_height_too_small");
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

export function optimizeImageArtifacts({ download, imageReview }) {
  const extension = imageReview.extension || "bin";
  const original = {
    kind: "original",
    buffer: download.buffer,
    mimeType: imageReview.mimeType,
    extension,
    hash: imageReview.hash,
    filename: `${imageReview.hash}-original.${extension}`,
  };
  const metadataSafe = createDerivativePng({
    hash: imageReview.hash,
    kind: "metadata_safe",
    size: 1024,
  });
  const square = createDerivativePng({
    hash: imageReview.hash,
    kind: "square",
    size: 1024,
  });
  const thumbnail = createDerivativePng({
    hash: imageReview.hash,
    kind: "thumbnail",
    size: 512,
  });
  return {
    original,
    metadataSafe,
    square,
    thumbnail,
    notes: [
      "metadata_safe_png_generated",
      "square_launch_format_generated",
      "thumbnail_generated",
    ],
  };
}

export function scoreImageArtifact({ imageReview = {}, imageAsset = {}, optimized = {} }) {
  const promptText = `${imageAsset.prompt || ""} ${imageAsset.imageSource || ""}`.toLowerCase();
  const hasSourceMedia = /source/.test(promptText) || ["source_image", "source_video_thumbnail"].includes(imageAsset.assetType);
  const hasMascot = /(mascot|character|symbol|silhouette|sticker|object|artifact)/.test(promptText);
  const squareReady = Boolean(optimized.square?.buffer);
  const thumbnailReady = Boolean(optimized.thumbnail?.buffer);
  const dimensionsGood = imageReview.width >= 512 && imageReview.height >= 512;
  const aspectGood = imageReview.aspectRatio >= 0.75 && imageReview.aspectRatio <= 1.35;
  const thumbnailStrength = clampScore(35 + (thumbnailReady ? 25 : 0) + (dimensionsGood ? 20 : 0) + (aspectGood ? 15 : 0));
  const memeReadability = clampScore(35 + (hasSourceMedia ? 20 : 0) + (hasMascot ? 25 : 0) + (squareReady ? 10 : 0));
  const silhouetteClarity = clampScore(30 + (hasMascot ? 30 : 0) + (squareReady ? 15 : 0));
  const remixability = clampScore(35 + (hasSourceMedia ? 20 : 0) + (thumbnailReady ? 15 : 0));
  const visualIdentityCohesion = clampScore(35 + (hasSourceMedia ? 20 : 0) + (hasMascot ? 20 : 0) + (imageReview.qualityScore >= 75 ? 10 : 0));
  const total = Math.round(
    thumbnailStrength * 0.2 +
    memeReadability * 0.22 +
    silhouetteClarity * 0.18 +
    remixability * 0.18 +
    visualIdentityCohesion * 0.22
  );
  return {
    thumbnailStrength,
    thumbnailStrengthLabel: labelScore(thumbnailStrength),
    memeReadability,
    memeReadabilityLabel: labelScore(memeReadability),
    silhouetteClarity,
    silhouetteClarityLabel: labelScore(silhouetteClarity),
    remixability,
    remixabilityLabel: labelScore(remixability),
    visualIdentityCohesion,
    visualIdentityCohesionLabel: labelScore(visualIdentityCohesion),
    total,
    label: labelScore(total),
  };
}

export function freezeMetadataPackage({ metadataJson, metadataUpload, hostedAssets, imageReview, report }) {
  const frozenAt = new Date().toISOString();
  const immutable = {
    frozenAt,
    metadataUrl: metadataUpload?.metadataUrl || "",
    imageUrl: metadataJson.image,
    thumbnailUrl: hostedAssets?.thumbnail?.url || "",
    metadataHash: hashText(JSON.stringify(metadataJson)),
    imageHash: imageReview.hash,
    packageHash: "",
    metadataJson,
    hostedAssetReferences: {
      original: hostedAssets?.original?.url || "",
      metadataSafe: hostedAssets?.metadataSafe?.url || "",
      square: hostedAssets?.square?.url || "",
      thumbnail: hostedAssets?.thumbnail?.url || "",
    },
    report,
  };
  immutable.packageHash = hashText(JSON.stringify(immutable));
  return Object.freeze(immutable);
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
  hostedAssets = null,
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
    thumbnailUrl: hostedAssets?.thumbnail?.url || "",
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

function extensionFromMime(mimeType = "") {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "bin";
}

function createDerivativePng({ hash, kind, size }) {
  const buffer = createSyntheticPng(`${hash}${kind}`, size);
  const derivativeHash = hashBuffer(buffer);
  return {
    kind: kind === "thumbnail" ? "thumbnail" : kind === "square" ? "square" : "metadata_safe",
    buffer,
    mimeType: "image/png",
    extension: "png",
    hash: derivativeHash,
    width: size,
    height: size,
    filename: `${hash}-${kind}.png`,
  };
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
    buffer: createSyntheticPng(hash, 512),
    source: "dry_wire_synthetic_download",
    url: imageAsset.imageUrl || imageAsset.image || "",
  };
}

function createSyntheticPng(hash, size = 512) {
  const width = size;
  const height = size;
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

function labelScore(score) {
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  return "LOW";
}
