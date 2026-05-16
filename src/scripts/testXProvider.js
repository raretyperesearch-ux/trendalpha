import { fetchXAttention } from "../providers/xProvider.js";

let posts = [];
try {
  posts = await fetchXAttention();
} catch (err) {
  console.error(`X provider test failed: ${err.message}`);
  process.exit(1);
}

if (posts.length === 0) {
  console.log("No X posts returned. Check X_BEARER_TOKEN, query access, and thresholds.");
  process.exit(0);
}

for (const post of posts) {
  console.log("=".repeat(80));
  console.log(`Name: ${post.name}`);
  console.log(`URL: ${post.sourceUrl}`);
  console.log(`Lane: ${post.discoveryLane}`);
  console.log(`Viral shape: ${post.viralShape} (${post.viralShapeReason})`);
  console.log(`Momentum trend: ${post.momentumTrend}`);
  console.log(`Launch worthiness: ${post.launchWorthinessScore}/100`);
  console.log(`Archetype: ${post.marketArchetype}`);
  console.log(`Narrative half-life: ${post.narrativeHalfLifeEstimate}`);
  console.log(`Recommendation: ${post.launchRecommendation}`);
  console.log(`Community formation: ${post.communityFormationLabel}`);
  console.log(`Remixability: ${post.remixabilityLabel}`);
  console.log(`Views: ${post.totalViews.toLocaleString()}`);
  console.log(`Views/hour: ${post.viewsPerHour.toLocaleString()}`);
  console.log(`Likes: ${post.likeCount.toLocaleString()}`);
  console.log(`Reposts: ${post.repostCount.toLocaleString()}`);
  console.log(`Quotes: ${post.quoteCount.toLocaleString()}`);
  console.log(`Shares: ${post.shareCount.toLocaleString()}`);
  console.log(`Shares/hour: ${post.shareVelocity.toLocaleString(undefined, { maximumFractionDigits: 1 })}`);
  console.log(`Reposts/hour: ${post.repostVelocity.toLocaleString(undefined, { maximumFractionDigits: 1 })}`);
  console.log(`Quotes/hour: ${post.quoteVelocity.toLocaleString(undefined, { maximumFractionDigits: 1 })}`);
  console.log(`Engagement acceleration: ${post.engagementAcceleration.toLocaleString()}`);
  console.log(`Repost acceleration: ${post.repostAcceleration.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  console.log(`Quote acceleration: ${post.quoteAcceleration.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  console.log(`Attention momentum: ${post.attentionMomentum.toLocaleString()}`);
  console.log(`Cross-community spread: ${post.crossCommunitySpreadScore.toLocaleString(undefined, { maximumFractionDigits: 1 })}`);
  console.log(`Marketability: ${post.marketabilityScore.toLocaleString()}`);
  console.log(`Quote explosion: ${post.quoteExplosion ? "yes" : "no"}`);
  console.log(`Share rate: ${(post.shareRate * 100).toFixed(3)}%`);
  console.log(`Quote rate: ${(post.quoteRate * 100).toFixed(1)}%`);
  console.log(`Quote/like rate: ${(post.quoteToLikeRate * 100).toFixed(2)}%`);
  console.log(`Attention shape: ${post.attentionShapeScore.toLocaleString()}`);
  if (post.riskFlags.length > 0) {
    console.log(`Flags: ${post.riskFlags.join(", ")}`);
  }
}
