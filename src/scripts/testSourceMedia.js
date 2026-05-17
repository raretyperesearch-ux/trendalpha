// ============================================================
// Test OINK source-media extraction and image priority
// Run: npm run test-source-media
// ============================================================

import { applySourceMedia, extractSourceMedia, getBestSourceMedia } from "../sourceMedia.js";
import { prepareImageAsset } from "../imageAssetPipeline.js";

const xPhotoPost = applySourceMedia({
  id: "x-photo-1",
  sourcePlatform: "x",
  sourceUrl: "https://x.com/example/status/111",
  author: "example",
  mediaAttachments: [
    {
      type: "photo",
      url: "https://pbs.twimg.com/media/source-artifact.jpg",
      width: 1200,
      height: 900,
    },
  ],
});

const xVideoPost = applySourceMedia({
  id: "x-video-1",
  sourcePlatform: "x",
  sourceUrl: "https://x.com/example/status/222",
  author: "example",
  mediaAttachments: [
    {
      type: "video",
      preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/source-video.jpg",
      width: 1280,
      height: 720,
    },
  ],
});

const tiktokTrend = applySourceMedia({
  id: "tt-cover-1",
  sourcePlatform: "tiktok",
  sourceUrl: "https://www.tiktok.com/tag/bananadog",
  author: "tiktok",
  coverImage: "https://p16-sign-va.tiktokcdn.com/tos-maliva-p-0068/cover.webp",
  coverWidth: 720,
  coverHeight: 1280,
  videoUrl: "https://www.tiktok.com/@example/video/123",
});

for (const item of [xPhotoPost, xVideoPost, tiktokTrend]) {
  const media = extractSourceMedia(item);
  const best = getBestSourceMedia(item);
  console.log(`\n${item.id}`);
  console.log(`Candidates: ${media?.candidates?.length || 0}`);
  console.log(`Selected asset: ${best.candidate?.assetType || "none"}`);
  console.log(`Selected type: ${best.candidate?.mediaType || "none"}`);
  console.log(`Selected URL: ${best.candidate?.url || "none"}`);
  console.log(`Valid: ${best.validation.valid ? "yes" : "no"}`);
  console.log(`Warnings: ${best.validation.warnings.join(", ") || "none"}`);
  console.log(`Errors: ${best.validation.errors.join(", ") || "none"}`);
}

const imageAsset = prepareImageAsset({
  launchId: "dry-cluster-BANANA-1",
  clusterId: "cluster-banana-dog",
  ticker: "BANANA",
  prompt: "Source artifact remix plan for banana dog: isolate the mascot silhouette from source media, keep the caption energy, preserve meme readability at tiny size, and make a repeatable sticker-like mark.",
  artifact: {
    sourceArtifactType: "mascot_artifact",
    extractedPhrase: "banana dog",
    identityCompressionSummary: "mascot artifact from source video thumbnail",
    visualReuseMode: "isolate_symbol",
  },
  narrative: {
    clusterName: "Banana Dog",
    archetype: "mascot",
  },
  sourceMedia: xPhotoPost.sourceMedia,
  dryWire: true,
});

console.log("\nImage priority test");
console.log(`Image source: ${imageAsset.imageSource}`);
console.log(`Asset type: ${imageAsset.assetType}`);
console.log(`Image: ${imageAsset.image}`);
console.log(`Validation: ${imageAsset.validationStatus}`);
