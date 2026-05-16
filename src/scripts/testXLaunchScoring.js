import { scoreTrend } from "../scoring.js";
import { scoreLaunchOpportunity } from "../launchScoring.js";
import { generateLaunchBrief } from "../launchBrief.js";

const now = Date.now();

const mockPosts = [
  {
    id: "x-good-animal",
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/1",
    name: "Dog steals the mic and starts howling",
    text: "bro really stole the mic and started howling",
    author: "example",
    authorName: "Example",
    type: "post",
    hasMedia: true,
    mediaType: "video",
    totalViews: 4_800_000,
    videoCount: 0,
    likeCount: 180_000,
    repostCount: 32_000,
    replyCount: 8_500,
    quoteCount: 7_200,
    shareCount: 39_200,
    shareVelocity: 4_900,
    repostVelocity: 4_000,
    quoteVelocity: 900,
    shareRate: 39_200 / 4_800_000,
    quoteRate: 7_200 / 39_200,
    likeRate: 180_000 / 4_800_000,
    replyRate: 8_500 / 4_800_000,
    engagementCount: 227_700,
    viewsPerHour: 600_000,
    engagementPerHour: 28_463,
    attentionShapeScore: 2_585_075,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: 1.2,
    trendDirection: "rising",
    discoveredAt: new Date(now).toISOString(),
    earliestVideo: Math.floor((now - 8 * 3600000) / 1000),
    riskFlags: [],
  },
  {
    id: "x-crypto-saturated",
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/2",
    name: "New memecoin CA 100x moonshot",
    text: "new memecoin CA just dropped on pump.fun this is the next 100x solana moonshot",
    author: "example",
    authorName: "Example",
    type: "post",
    hasMedia: true,
    mediaType: "photo",
    totalViews: 850_000,
    videoCount: 0,
    likeCount: 9_400,
    repostCount: 1_100,
    replyCount: 900,
    quoteCount: 180,
    shareCount: 1_280,
    shareVelocity: 256,
    repostVelocity: 220,
    quoteVelocity: 36,
    shareRate: 1_280 / 850_000,
    quoteRate: 180 / 1_280,
    likeRate: 9_400 / 850_000,
    replyRate: 900 / 850_000,
    engagementCount: 11_580,
    viewsPerHour: 170_000,
    engagementPerHour: 2_316,
    attentionShapeScore: 242_130,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: 1.2,
    trendDirection: "rising",
    discoveredAt: new Date(now).toISOString(),
    earliestVideo: Math.floor((now - 5 * 3600000) / 1000),
    riskFlags: ["crypto_saturated_language"],
    cryptoSaturatedLanguage: true,
  },
  {
    id: "x-sensitive",
    sourcePlatform: "x",
    sourceUrl: "https://x.com/example/status/3",
    name: "Tragedy at celebrity concert",
    text: "this tragedy at the celebrity concert is heartbreaking",
    author: "example",
    authorName: "Example",
    type: "post",
    hasMedia: true,
    mediaType: "video",
    totalViews: 2_100_000,
    videoCount: 0,
    likeCount: 44_000,
    repostCount: 9_000,
    replyCount: 12_000,
    quoteCount: 3_200,
    shareCount: 12_200,
    shareVelocity: 1_743,
    repostVelocity: 1_286,
    quoteVelocity: 457,
    shareRate: 12_200 / 2_100_000,
    quoteRate: 3_200 / 12_200,
    likeRate: 44_000 / 2_100_000,
    replyRate: 12_000 / 2_100_000,
    engagementCount: 68_200,
    viewsPerHour: 300_000,
    engagementPerHour: 9_743,
    attentionShapeScore: 1_379_000,
    rank: null,
    rankChange: 0,
    rankChangeType: null,
    acceleration: 1.2,
    trendDirection: "rising",
    discoveredAt: new Date(now).toISOString(),
    earliestVideo: Math.floor((now - 7 * 3600000) / 1000),
    riskFlags: [],
  },
];

for (const post of mockPosts) {
  const trendScore = scoreTrend(post);
  const score = scoreLaunchOpportunity(post);
  const brief = generateLaunchBrief({
    trend: post,
    trendScore,
    launchScore: score,
    token: null,
  });
  console.log("=".repeat(80));
  console.log(`${post.name}`);
  console.log(`Launch Score: ${score.total}/100 (${score.label})`);
  console.log("Breakdown:", score.breakdown);
  console.log("Reasons:");
  for (const reason of score.reasons) {
    console.log(`- ${reason}`);
  }
  console.log(`Risk Flags: ${score.riskFlags.length > 0 ? score.riskFlags.join(", ") : "none"}`);
  console.log(`Suggested Name: ${brief.suggestedName}`);
  console.log(`Suggested Ticker: $${brief.suggestedTicker}`);
  console.log(`Social Tag: ${brief.socialTag}`);
  console.log(`Source Backlink: ${brief.sourceBacklinkText}`);
  console.log("Suggested X Post:");
  console.log(brief.xLaunchPost);
}
