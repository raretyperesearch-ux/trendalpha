const MIN_SOURCE_DIMENSION = 180;
const SUPPORTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif)(\?|$)/i;

export class SourceMediaExtractor {
  extract(input = {}) {
    if (input.sourcePlatform === "x") return extractXMedia(input);
    if (input.sourcePlatform === "tiktok") return extractTikTokMedia(input);
    return null;
  }
}

export function extractSourceMedia(input) {
  return new SourceMediaExtractor().extract(input);
}

export function getBestSourceMedia(input) {
  const media = input?.sourceMedia || extractSourceMedia(input);
  if (media?.preferred && !media?.candidates?.length) {
    return { candidate: media.preferred, validation: validateSourceMedia(media.preferred) };
  }
  if (!media?.candidates?.length) return { candidate: null, validation: { valid: false, errors: ["source_media_missing"], warnings: [] } };

  const ranked = media.candidates
    .map((candidate) => ({ candidate, validation: validateSourceMedia(candidate) }))
    .sort((a, b) => getMediaPriority(a.candidate) - getMediaPriority(b.candidate));

  const valid = ranked.find((item) => item.validation.valid);
  return valid || ranked[0];
}

export function validateSourceMedia(media = {}) {
  const errors = [];
  const warnings = [];
  const url = media.url || media.previewImageUrl;

  if (!url) errors.push("source_media_url_missing");
  if (url && !isHttpsUrl(url)) errors.push("source_media_url_not_https");
  if (media.width && media.width < MIN_SOURCE_DIMENSION) errors.push("source_media_width_too_small");
  if (media.height && media.height < MIN_SOURCE_DIMENSION) errors.push("source_media_height_too_small");
  if (looksLikeAvatar(media)) errors.push("likely_avatar_or_profile_image");
  if (!["photo", "video_thumbnail", "animated_gif_thumbnail", "cover_image"].includes(media.assetType)) {
    errors.push("source_media_file_type_unsupported");
  }
  if (!media.width || !media.height) warnings.push("source_media_dimensions_missing");
  if (url && !SUPPORTED_IMAGE_EXTENSIONS.test(url) && media.assetType === "photo") warnings.push("source_media_extension_unknown");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function applySourceMedia(input) {
  if (!input) return input;
  const sourceMedia = extractSourceMedia(input);
  input.sourceMedia = sourceMedia;
  if (sourceMedia?.preferred) {
    input.sourceMediaUrl = sourceMedia.preferred.url || sourceMedia.preferred.previewImageUrl;
    input.sourceMediaType = sourceMedia.preferred.mediaType;
  }
  return input;
}

function extractXMedia(post) {
  const raw = post.mediaAttachments || post.media || [];
  const candidates = raw.map((media, index) => {
    const type = media.type || "unknown";
    const url = media.url || media.preview_image_url || media.previewImageUrl || "";
    const previewImageUrl = media.preview_image_url || media.previewImageUrl || media.url || "";
    return {
      sourcePlatform: "x",
      sourcePostUrl: post.sourceUrl,
      sourceAuthor: post.author,
      sourceBacklink: post.sourceUrl,
      sourceMediaUrl: url,
      mediaType: type,
      assetType: type === "photo" ? "photo" : type === "animated_gif" ? "animated_gif_thumbnail" : "video_thumbnail",
      url: type === "photo" ? url : previewImageUrl,
      previewImageUrl,
      width: Number(media.width || 0),
      height: Number(media.height || 0),
      position: index,
    };
  });
  return finalizeMedia("x", candidates);
}

function extractTikTokMedia(trend) {
  const cover = trend.coverImage || trend.thumbnailUrl || trend.coverUrl || trend.videoCover || "";
  const videoUrl = trend.videoUrl || trend.songLink || "";
  const candidates = [];
  if (cover) {
    candidates.push({
      sourcePlatform: "tiktok",
      sourcePostUrl: trend.sourceUrl,
      sourceAuthor: trend.author || trend.artist || "",
      sourceBacklink: trend.sourceUrl,
      sourceMediaUrl: cover,
      mediaType: "cover_image",
      assetType: "cover_image",
      url: cover,
      previewImageUrl: cover,
      width: Number(trend.coverWidth || 0),
      height: Number(trend.coverHeight || 0),
      videoUrl,
    });
  } else if (videoUrl) {
    candidates.push({
      sourcePlatform: "tiktok",
      sourcePostUrl: trend.sourceUrl,
      sourceAuthor: trend.author || trend.artist || "",
      sourceBacklink: trend.sourceUrl,
      sourceMediaUrl: "",
      mediaType: "video_reference",
      assetType: "video_reference",
      url: "",
      previewImageUrl: "",
      width: 0,
      height: 0,
      videoUrl,
    });
  }
  return finalizeMedia("tiktok", candidates);
}

function finalizeMedia(sourcePlatform, candidates) {
  const ranked = candidates
    .map((candidate) => ({ candidate, validation: validateSourceMedia(candidate) }))
    .sort((a, b) => getMediaPriority(a.candidate) - getMediaPriority(b.candidate));
  const selected = ranked.find((item) => item.validation.valid)?.candidate || ranked[0]?.candidate || null;
  return {
    sourcePlatform,
    candidates,
    preferred: selected,
    validation: selected ? validateSourceMedia(selected) : { valid: false, errors: ["source_media_missing"], warnings: [] },
  };
}

function getMediaPriority(media = {}) {
  if (media.assetType === "photo") return 1;
  if (media.assetType === "video_thumbnail") return 2;
  if (media.assetType === "animated_gif_thumbnail") return 2;
  if (media.assetType === "cover_image") return 2;
  return 9;
}

function looksLikeAvatar(media = {}) {
  const url = String(media.url || media.previewImageUrl || "").toLowerCase();
  if (url.includes("profile_images") || url.includes("avatar")) return true;
  return media.width && media.height && media.width <= 128 && media.height <= 128;
}

function isHttpsUrl(url) {
  try {
    return new URL(String(url)).protocol === "https:";
  } catch (_) {
    return false;
  }
}
