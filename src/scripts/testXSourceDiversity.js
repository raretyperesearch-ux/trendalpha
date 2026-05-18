// ============================================================
// Test X source diversity controls
// Run: npm run test-x-source-diversity
// ============================================================

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.X_MAX_POSTS_PER_AUTHOR_PER_SCAN = "2";
process.env.X_MAX_TRUSTED_ACCOUNT_POSTS_PER_SCAN = "3";
process.env.X_MIN_BROAD_STREAM_POSTS_PER_SCAN = "4";
process.env.X_ENABLE_TRUSTED_ACCOUNTS = "true";

const { applyXSourceDiversity } = await import("../providers/xProvider.js");

const posts = [
  ...makePosts({ author: "PopBase", lane: "trusted_viral_accounts", count: 8, score: 10000 }),
  ...makePosts({ author: "Dexerto", lane: "trusted_viral_accounts", count: 4, score: 9000 }),
  ...makePosts({ author: "broadA", lane: "broad_media_stream", count: 3, score: 8000 }),
  ...makePosts({ author: "broadB", lane: "broad_media_stream", count: 3, score: 7000 }),
  ...makePosts({ author: "emergeA", lane: "emerging_accounts", count: 2, score: 6000 }),
  ...makePosts({ author: "quoteA", lane: "quote_explosion_watch", count: 2, score: 5000 }),
];

const diverse = applyXSourceDiversity(posts, {
  maxPostsPerAuthor: 2,
  maxTrustedPosts: 3,
  minBroadPosts: 4,
  enableTrustedAccounts: true,
});

const authorCounts = countBy(diverse, (post) => post.author);
const laneCounts = countBy(diverse, (post) => post.discoveryLane);
const trustedCount = laneCounts.trusted_viral_accounts || 0;
const broadCount =
  (laneCounts.broad_media_stream || 0) +
  (laneCounts.emerging_accounts || 0) +
  (laneCounts.quote_explosion_watch || 0);

const trustedDisabled = applyXSourceDiversity(posts, {
  maxPostsPerAuthor: 2,
  maxTrustedPosts: 3,
  minBroadPosts: 4,
  enableTrustedAccounts: false,
});

console.log("X source diversity test");
console.log(`Total selected: ${diverse.length}`);
console.log(`Trusted selected: ${trustedCount}`);
console.log(`Broad/emerging/quote selected: ${broadCount}`);
console.log(`Max author count: ${Math.max(...Object.values(authorCounts))}`);
console.log(`Trusted disabled selected trusted: ${trustedDisabled.some((post) => post.discoveryLane === "trusted_viral_accounts") ? "yes" : "no"}`);

if (Math.max(...Object.values(authorCounts)) > 2) process.exitCode = 1;
if (trustedCount > 3) process.exitCode = 1;
if (broadCount < 4) process.exitCode = 1;
if (trustedDisabled.some((post) => ["PopBase", "Dexerto"].includes(post.author))) process.exitCode = 1;

function makePosts({ author, lane, count, score }) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${author}-${lane}-${index}`,
    author,
    discoveryLane: lane,
    attentionShapeScore: score - index,
    riskFlags: [],
  }));
}

function countBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
