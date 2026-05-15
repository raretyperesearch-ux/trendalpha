import { scoreLaunchOpportunity } from "../launchScoring.js";

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
    engagementCount: 227_700,
    viewsPerHour: 600_000,
    engagementPerHour: 28_463,
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
    engagementCount: 11_580,
    viewsPerHour: 170_000,
    engagementPerHour: 2_316,
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
    engagementCount: 68_200,
    viewsPerHour: 300_000,
    engagementPerHour: 9_743,
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
  const score = scoreLaunchOpportunity(post);
  console.log("=".repeat(80));
  console.log(`${post.name}`);
  console.log(`Launch Score: ${score.total}/100 (${score.label})`);
  console.log("Breakdown:", score.breakdown);
  console.log("Reasons:");
  for (const reason of score.reasons) {
    console.log(`- ${reason}`);
  }
  console.log(`Risk Flags: ${score.riskFlags.length > 0 ? score.riskFlags.join(", ") : "none"}`);
}
