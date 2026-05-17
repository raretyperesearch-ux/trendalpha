import fs from "node:fs";
import { config } from "./config.js";
import { getBestSourceMedia } from "./sourceMedia.js";

const IMAGE_STATES = {
  DRAFT: "draft",
  IMAGE_NEEDED: "image_needed",
  IMAGE_READY: "image_ready",
  VALIDATION_FAILED: "validation_failed",
};

const GENERIC_PROMPT_TERMS = [
  "logo", "coin", "crypto", "token", "mascot", "viral", "meme",
];

const BAD_STYLE_TERMS = [
  "corporate", "premium", "luxury", "professional headshot", "photorealistic",
  "realistic portrait", "stock photo", "3d render", "polished brand system",
];

export class ImageAssetPipeline {
  constructor(options = {}) {
    this.mode = options.mode || config.metadata.imageMode || "placeholder";
    this.localPath = options.localPath || config.metadata.imageLocalPath || "";
    this.remoteUrl = options.remoteUrl || config.metadata.imageRemoteUrl || "";
    this.enableSourceMediaHotlink = options.enableSourceMediaHotlink ?? config.metadata.enableSourceMediaHotlink;
  }

  prepare({ launchId, clusterId, ticker, prompt, artifact = {}, narrative = {}, sourceMedia = null, dryWire = true }) {
    const selectedMedia = getBestSourceMedia({ sourceMedia });
    const sourceChoice = chooseImageSource({
      mode: this.mode,
      selectedMedia,
      localPath: this.localPath,
      remoteUrl: this.remoteUrl,
      dryWire,
      enableSourceMediaHotlink: this.enableSourceMediaHotlink,
    });
    const quality = scoreVisualIdentity({ prompt, artifact, narrative });
    const validation = validateImageAsset({
      mode: sourceChoice.mode,
      prompt,
      localPath: this.localPath,
      remoteUrl: sourceChoice.imageUrl,
      quality,
      artifact,
      sourceChoice,
    });

    const state = getImageState({ mode: sourceChoice.mode, validation });
    return {
      launchId,
      clusterId,
      ticker,
      assetType: sourceChoice.assetType,
      mode: sourceChoice.mode,
      imageSource: sourceChoice.imageSource,
      prompt,
      image: sourceChoice.image,
      imageUrl: sourceChoice.imageUrl,
      localPath: sourceChoice.localPath,
      sourceMedia: sourceChoice.sourceMedia,
      sourcePlatform: sourceChoice.sourceMedia?.sourcePlatform || "",
      sourcePostUrl: sourceChoice.sourceMedia?.sourcePostUrl || "",
      sourceAuthor: sourceChoice.sourceMedia?.sourceAuthor || "",
      sourceMediaUrl: sourceChoice.sourceMedia?.sourceMediaUrl || sourceChoice.imageUrl || "",
      sourceMediaType: sourceChoice.sourceMedia?.mediaType || "",
      sourceBacklink: sourceChoice.sourceMedia?.sourceBacklink || "",
      aiHook: sourceChoice.mode === "future_ai_hook"
        ? { status: "reserved", note: "Future AI image generation hook; no image generated in dry-wire mode." }
        : null,
      qualityScore: quality.total,
      visualScore: quality,
      validationStatus: validation.valid ? state : IMAGE_STATES.VALIDATION_FAILED,
      validation,
      createdAt: new Date().toISOString(),
    };
  }
}

export function prepareImageAsset(input, options = {}) {
  return new ImageAssetPipeline(options).prepare(input);
}

export function scoreVisualIdentity({ prompt = "", artifact = {}, narrative = {} }) {
  const text = `${prompt} ${artifact.identityCompressionSummary || ""} ${narrative.clusterName || ""}`.toLowerCase();
  const hasObject = /(dog|cat|robot|alien|banana|ghost|frog|bird|mask|symbol|object|mascot|silhouette|mark|character)/i.test(text);
  const hasEmotion = Boolean(artifact.emotionalTexture) || /(awe|joy|chaos|tension|absurd|funny|cute|weird)/i.test(text);
  const hasArtifact = Boolean(artifact.sourceArtifactType || artifact.artifactType || artifact.extractedPhrase);
  const hasSilhouette = /silhouette|simple mark|bold simple|readable at tiny size|thumbnail/i.test(prompt);
  const hasRemix = /remix|sticker|caption|overlay|meme|source artifact|visual plan/i.test(text);

  const silhouetteClarity = clampScore(35 + (hasSilhouette ? 35 : 0) + (hasObject ? 20 : 0));
  const memeReadability = clampScore(35 + (hasArtifact ? 25 : 0) + (artifact.extractedPhrase ? 20 : 0));
  const screenshotSurvivability = clampScore(35 + (hasSilhouette ? 25 : 0) + (hasObject ? 20 : 0));
  const remixability = clampScore(30 + (hasRemix ? 30 : 0) + (artifact.visualReuseMode && artifact.visualReuseMode !== "generate_new_image" ? 15 : 0));
  const narrativeAlignment = clampScore(30 + (hasArtifact ? 30 : 0) + (narrative.clusterName ? 15 : 0));
  const emotionalTexture = clampScore(25 + (hasEmotion ? 35 : 0));
  const thumbnailStrength = clampScore(30 + (hasSilhouette ? 30 : 0) + (hasObject ? 25 : 0));

  const total = Math.round(
    silhouetteClarity * 0.16 +
    memeReadability * 0.16 +
    screenshotSurvivability * 0.14 +
    remixability * 0.14 +
    narrativeAlignment * 0.16 +
    emotionalTexture * 0.1 +
    thumbnailStrength * 0.14
  );

  return {
    silhouetteClarity,
    memeReadability,
    screenshotSurvivability,
    remixability,
    narrativeAlignment,
    emotionalTexture,
    thumbnailStrength,
    thumbnailStrengthLabel: labelScore(thumbnailStrength),
    total,
  };
}

export function validateImageAsset({ mode, prompt = "", localPath = "", remoteUrl = "", quality, artifact = {}, sourceChoice = {} }) {
  const errors = [];
  const warnings = [];
  const lowerPrompt = String(prompt || "").toLowerCase();
  const meaningfulTerms = lowerPrompt.split(/\s+/).filter((word) => word.length > 3 && !GENERIC_PROMPT_TERMS.includes(word));

  if (!prompt || prompt.length < 40) errors.push("image_prompt_too_short");
  if (meaningfulTerms.length < 6) errors.push("image_prompt_too_generic");
  if (BAD_STYLE_TERMS.some((term) => lowerPrompt.includes(term))) errors.push("image_prompt_bad_style");
  if (!/(silhouette|symbol|object|mascot|mark|character|artifact|freeze|caption|sticker)/i.test(prompt)) {
    errors.push("missing_clear_mascot_object_or_symbol");
  }
  if (!/(remix|meme|caption|sticker|source|artifact|repeatable|thumbnail|tiny size)/i.test(prompt)) {
    errors.push("missing_remix_potential");
  }
  if (!artifact.extractedPhrase && !artifact.identityCompressionSummary && !artifact.sourceArtifactType && !artifact.artifactType) {
    warnings.push("weak_artifact_context");
  }

  if (sourceChoice.mode === "source_media" && !sourceChoice.sourceValidation?.valid) {
    errors.push("source_media_validation_failed");
  }
  if (sourceChoice.mode === "source_media" && !sourceChoice.dryWire && !sourceChoice.enableSourceMediaHotlink && !sourceChoice.rehostRequired) {
    errors.push("source_media_hotlink_disabled");
  }

  if (mode === "source_media") {
    if (!remoteUrl || !isValidHttpsUrl(remoteUrl)) errors.push("source_media_url_invalid");
  } else if (mode === "placeholder") {
    errors.push("placeholder_image_not_launch_ready");
  } else if (mode === "local_generated_asset") {
    if (!localPath) errors.push("local_image_path_missing");
    else if (!fs.existsSync(localPath)) errors.push("local_image_path_not_found");
  } else if (mode === "remote_url") {
    if (!isValidHttpsUrl(remoteUrl)) errors.push("remote_image_url_invalid");
  } else if (mode === "future_ai_hook") {
    errors.push("future_ai_image_hook_not_resolved");
  } else {
    errors.push("unknown_image_mode");
  }

  if (quality.total < 55) errors.push("visual_quality_below_threshold");
  if (quality.thumbnailStrength < 55) errors.push("thumbnail_strength_low");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function getImageState({ mode, validation }) {
  if (validation.valid) return IMAGE_STATES.IMAGE_READY;
  if (mode === "placeholder" || mode === "future_ai_hook") return IMAGE_STATES.IMAGE_NEEDED;
  return IMAGE_STATES.VALIDATION_FAILED;
}

function chooseImageSource({ mode, selectedMedia, localPath, remoteUrl, dryWire, enableSourceMediaHotlink }) {
  const sourceMedia = selectedMedia?.candidate || null;
  const sourceValidation = selectedMedia?.validation || { valid: false, errors: ["source_media_missing"], warnings: [] };
  if (sourceMedia && sourceValidation.valid) {
    return {
      mode: "source_media",
      assetType: sourceMedia.assetType === "photo" || sourceMedia.assetType === "cover_image" ? "source_image" : "source_video_thumbnail",
      imageSource: sourceMedia.assetType === "photo" || sourceMedia.assetType === "cover_image" ? "SOURCE POST MEDIA" : "SOURCE VIDEO THUMBNAIL",
      image: sourceMedia.url || sourceMedia.previewImageUrl,
      imageUrl: sourceMedia.url || sourceMedia.previewImageUrl,
      localPath: "",
      sourceMedia,
      sourceValidation,
      dryWire,
      enableSourceMediaHotlink,
      rehostRequired: !dryWire && !enableSourceMediaHotlink,
    };
  }

  if (mode === "local_generated_asset") {
    return { mode, assetType: "generated_image", imageSource: "LOCAL GENERATED ASSET", image: localPath, imageUrl: "", localPath, sourceMedia, sourceValidation, dryWire, enableSourceMediaHotlink };
  }
  if (mode === "remote_url") {
    return { mode, assetType: "generated_image", imageSource: "REMOTE GENERATED ASSET", image: remoteUrl, imageUrl: remoteUrl, localPath: "", sourceMedia, sourceValidation, dryWire, enableSourceMediaHotlink };
  }
  if (sourceMedia && !sourceValidation.valid) {
    return { mode: "future_ai_hook", assetType: "remixed_image", imageSource: "REMIX FROM SOURCE PROMPT", image: "", imageUrl: "", localPath: "", sourceMedia, sourceValidation, dryWire, enableSourceMediaHotlink };
  }
  if (mode === "future_ai_hook") {
    return { mode, assetType: "generated_image", imageSource: "GENERATED FALLBACK", image: "", imageUrl: "", localPath: "", sourceMedia, sourceValidation, dryWire, enableSourceMediaHotlink };
  }
  return { mode: "placeholder", assetType: "placeholder", imageSource: "PLACEHOLDER DRY-WIRE", image: "", imageUrl: "", localPath: "", sourceMedia, sourceValidation, dryWire, enableSourceMediaHotlink };
}

function getImageReference({ mode, localPath, remoteUrl }) {
  if (mode === "remote_url") return remoteUrl;
  if (mode === "local_generated_asset") return localPath;
  return "";
}

function isValidHttpsUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:";
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
