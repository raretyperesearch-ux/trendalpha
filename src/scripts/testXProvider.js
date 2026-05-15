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
  console.log(`Views: ${post.totalViews.toLocaleString()}`);
  console.log(`Likes: ${post.likeCount.toLocaleString()}`);
  console.log(`Reposts: ${post.repostCount.toLocaleString()}`);
  console.log(`Replies: ${post.replyCount.toLocaleString()}`);
  console.log(`Quotes: ${post.quoteCount.toLocaleString()}`);
  console.log(`Views/hour: ${post.viewsPerHour.toLocaleString()}`);
  console.log(`Engagement/hour: ${post.engagementPerHour.toLocaleString()}`);
  if (post.riskFlags.length > 0) {
    console.log(`Flags: ${post.riskFlags.join(", ")}`);
  }
}
