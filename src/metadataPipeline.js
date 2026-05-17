import { config } from "./config.js";
import { prepareImageAsset } from "./imageAssetPipeline.js";

const METADATA_STATES = {
  DRAFT: "draft",
  IMAGE_NEEDED: "image_needed",
  IMAGE_READY: "image_ready",
  METADATA_READY: "metadata_ready",
  VALIDATION_FAILED: "validation_failed",
};

const GENERIC_PLACEHOLDERS = [
  "tbd", "todo", "placeholder", "coming soon", "n/a", "test token", "sample",
];

export class MetadataPipeline {
  constructor(options = {}) {
    this.imageOptions = options.imageOptions || {};
  }

  prepare({ shadowLaunch, deploymentPayload }) {
    const source = shadowLaunch.payload || {};
    const token = deploymentPayload?.token || source.token || {};
    const narrative = source.narrative || deploymentPayload?.launchContext || {};
    const artifact = {
      sourceArtifactType: source.sourceArtifactType,
      artifactType: source.sourceArtifactType,
      artifactStrength: source.artifactStrength,
      visualReuseMode: source.visualReuseMode,
      extractedPhrase: source.extractedPhrase,
      emotionalTexture: source.emotionalTexture,
      identityCompressionSummary: source.identityCompressionSummary,
    };
    const sourceMedia = source.sourceMedia || getPayloadSourceMedia(source);

    const imageAsset = prepareImageAsset({
      launchId: shadowLaunch.launchId,
      clusterId: shadowLaunch.clusterId,
      ticker: token.symbol || shadowLaunch.ticker,
      prompt: source.imagePrompt || "",
      artifact,
      narrative,
      sourceMedia,
      dryWire: deploymentPayload?.mode === "dry_wire",
    }, this.imageOptions);

    const metadata = {
      name: cleanField(token.name || shadowLaunch.title, 32),
      symbol: normalizeTicker(token.symbol || token.ticker || shadowLaunch.ticker),
      description: cleanField(token.description || source.socialPostDraft?.pumpfunDescription || "", 500),
      image: imageAsset.image,
      twitter: config.metadata.twitter,
      telegram: config.metadata.telegram,
      website: config.metadata.website,
      narrativeSummary: cleanField(narrative.summary || source.identityCompressionSummary || "", 600),
      sourceBacklink: getSourceBacklink(source),
      identityArchetype: narrative.archetype || "trendwave",
      sloganFragments: buildSloganFragments({ source, token, narrative }),
    };

    const validation = validateMetadata(metadata, imageAsset);
    const state = getMetadataState(validation, imageAsset);

    return {
      state,
      metadata,
      imageAsset,
      validation,
      createdAt: new Date().toISOString(),
    };
  }
}

export function prepareLaunchMetadata(input, options = {}) {
  return new MetadataPipeline(options).prepare(input);
}

export function validateMetadata(metadata, imageAsset) {
  const errors = [];
  const warnings = [];

  if (!metadata.name || metadata.name.length < 3 || metadata.name.length > 32) errors.push("name_length_invalid");
  if (!metadata.symbol || metadata.symbol.length < 3 || metadata.symbol.length > 10) errors.push("ticker_length_invalid");
  if (!metadata.description || metadata.description.length < 40 || metadata.description.length > 500) errors.push("description_length_invalid");
  if (!metadata.image) errors.push("image_missing");
  if (metadata.image && metadata.image.startsWith("http") && !isValidHttpsUrl(metadata.image)) errors.push("image_url_not_https");
  if (!metadata.narrativeSummary) errors.push("narrative_summary_missing");
  if (!metadata.sourceBacklink) warnings.push("source_backlink_missing");
  if (!metadata.identityArchetype) errors.push("identity_archetype_missing");
  if (!Array.isArray(metadata.sloganFragments) || metadata.sloganFragments.length === 0) errors.push("slogan_fragments_missing");

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" && isGenericPlaceholder(value)) errors.push(`${key}_is_placeholder`);
  }

  if (!imageAsset.validation.valid) errors.push("image_asset_not_ready");
  if (imageAsset.qualityScore < 60) errors.push("image_quality_below_metadata_threshold");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function getMetadataState(validation, imageAsset) {
  if (validation.valid) return METADATA_STATES.METADATA_READY;
  if (imageAsset.validationStatus === "image_ready") return METADATA_STATES.IMAGE_READY;
  if (imageAsset.validationStatus === "image_needed") return METADATA_STATES.IMAGE_NEEDED;
  if (validation.errors.length > 0) return METADATA_STATES.VALIDATION_FAILED;
  return METADATA_STATES.DRAFT;
}

function buildSloganFragments({ source, token, narrative }) {
  return [
    source.extractedPhrase,
    source.emotionalTexture ? `${source.emotionalTexture} compressed into market identity` : "",
    narrative.archetype ? `${narrative.archetype} energy` : "",
    token.symbol ? `$${normalizeTicker(token.symbol)}` : "",
  ].filter(Boolean).slice(0, 4);
}

function getSourceBacklink(source) {
  if (source.sourceBacklink) return source.sourceBacklink;
  if (source.sourceMedia?.preferred?.sourceBacklink) return source.sourceMedia.preferred.sourceBacklink;
  const posts = source.relatedPosts || [];
  const linked = posts.find((post) => post.sourceUrl);
  return linked?.sourceUrl || source.sourceUrl || "";
}

function getPayloadSourceMedia(source) {
  const sourcePost = (source.relatedPosts || []).find((post) => post.sourceMedia);
  if (sourcePost?.sourceMedia) return sourcePost.sourceMedia;
  return null;
}

function cleanField(value = "", maxLength = 255) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeTicker(value = "") {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function isGenericPlaceholder(value) {
  const lower = String(value || "").trim().toLowerCase();
  return GENERIC_PLACEHOLDERS.includes(lower);
}

function isValidHttpsUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}
