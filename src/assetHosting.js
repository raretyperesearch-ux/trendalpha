import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export class AssetHostingProvider {
  constructor(options = {}) {
    this.provider = options.provider || config.metadata.assetHostingProvider || "local";
    this.baseUrl = options.baseUrl || config.metadata.hostedAssetBaseUrl;
    this.localDir = options.localDir || config.metadata.assetLocalDir;
    this.maxRetries = Number(options.maxRetries ?? config.metadata.assetUploadRetries ?? 2);
  }

  async uploadAsset({ buffer, filename, contentType, kind = "image", hash }) {
    return withRetries(async () => this.writeAsset({ buffer, filename, contentType, kind, hash }), this.maxRetries);
  }

  async writeAsset() {
    throw new Error(`${this.provider} asset hosting provider must implement writeAsset()`);
  }

  capabilities() {
    return {
      provider: this.provider,
      localStorage: false,
      temporaryCdn: false,
      ipfs: false,
      pumpPortalNative: false,
      retryable: true,
    };
  }
}

export class LocalAssetHostingProvider extends AssetHostingProvider {
  constructor(options = {}) {
    super({ ...options, provider: "local" });
  }

  async writeAsset({ buffer, filename, contentType, kind, hash }) {
    const safeKind = sanitizePathPart(kind || "asset");
    const safeName = sanitizePathPart(filename || `${hash || Date.now()}.bin`);
    const relativePath = path.posix.join(safeKind, safeName);
    const diskPath = path.join(this.localDir, relativePath);
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    let duplicate = false;
    try {
      await fs.access(diskPath);
      duplicate = true;
    } catch (_) {
      duplicate = false;
    }
    await fs.writeFile(diskPath, buffer);
    return {
      provider: this.provider,
      status: duplicate ? "duplicate_replaced" : "uploaded",
      uploaded: true,
      url: `${this.baseUrl.replace(/\/$/, "")}/${relativePath}`,
      localPath: diskPath,
      storageKey: relativePath,
      contentType,
      byteSize: buffer.length,
      hash,
    };
  }

  capabilities() {
    return {
      ...super.capabilities(),
      localStorage: true,
    };
  }
}

export class TemporaryCdnAssetHostingProvider extends AssetHostingProvider {
  constructor(options = {}) {
    super({ ...options, provider: "temporary_cdn" });
  }

  async writeAsset({ buffer, filename, contentType, kind, hash }) {
    const safeKind = sanitizePathPart(kind || "asset");
    const safeName = sanitizePathPart(filename || `${hash || Date.now()}.bin`);
    return {
      provider: this.provider,
      status: "prepared",
      uploaded: false,
      url: `${this.baseUrl.replace(/\/$/, "")}/${safeKind}/${safeName}`,
      storageKey: `${safeKind}/${safeName}`,
      contentType,
      byteSize: buffer.length,
      hash,
      note: "Temporary CDN mode prepared only. No remote upload performed.",
    };
  }

  capabilities() {
    return {
      ...super.capabilities(),
      temporaryCdn: true,
    };
  }
}

export class FutureIpfsAssetHostingProvider extends AssetHostingProvider {
  constructor(options = {}) {
    super({ ...options, provider: "future_ipfs" });
  }

  async writeAsset() {
    throw new Error("Future IPFS mode is an interface only; no credentials or pinning calls are enabled");
  }

  capabilities() {
    return {
      ...super.capabilities(),
      ipfs: true,
    };
  }
}

export class FuturePumpPortalAssetHostingProvider extends AssetHostingProvider {
  constructor(options = {}) {
    super({ ...options, provider: "future_pumpportal_native" });
  }

  async writeAsset() {
    throw new Error("Future PumpPortal-native upload mode is an interface only; no live endpoint calls are enabled");
  }

  capabilities() {
    return {
      ...super.capabilities(),
      pumpPortalNative: true,
    };
  }
}

export function createAssetHostingProvider(options = {}) {
  const provider = options.provider || config.metadata.assetHostingProvider || "local";
  if (provider === "local" || provider === "local_storage") return new LocalAssetHostingProvider(options);
  if (provider === "temporary_cdn" || provider === "temp_cdn") return new TemporaryCdnAssetHostingProvider(options);
  if (provider === "future_ipfs" || provider === "ipfs") return new FutureIpfsAssetHostingProvider(options);
  if (provider === "future_pumpportal_native" || provider === "pumpportal_native") return new FuturePumpPortalAssetHostingProvider(options);
  return new LocalAssetHostingProvider(options);
}

async function withRetries(fn, maxRetries) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await fn();
      return { ...result, attempts: attempt + 1 };
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  return {
    provider: "unknown",
    status: "failed",
    uploaded: false,
    attempts: maxRetries + 1,
    error: lastError?.message || "asset_upload_failed",
  };
}

function sanitizePathPart(value) {
  return String(value || "asset")
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "asset";
}
