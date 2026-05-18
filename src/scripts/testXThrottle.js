// ============================================================
// Test X provider cache/throttle and daily request budget
// Run: npm run test-x-throttle
// ============================================================

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.X_BEARER_TOKEN = "test-bearer";
process.env.X_SEARCH_QUERIES = "(cat) lang:en -is:retweet";
process.env.X_SCAN_INTERVAL_MINUTES = "60";
process.env.X_CACHE_TTL_MINUTES = "60";
process.env.X_MAX_REQUESTS_PER_DAY = "2";
process.env.X_MIN_VIEWS_PER_HOUR = "1";
process.env.X_MIN_SHARE_VELOCITY = "1";
process.env.X_MIN_ATTENTION_SHAPE_SCORE = "1";
process.env.X_MIN_ENGAGEMENT_PER_HOUR = "1";
process.env.X_RESULTS_PER_QUERY = "10";

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return Response.json({
    data: [{
      id: "123",
      text: "cat discovers a tiny piano",
      author_id: "u1",
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      lang: "en",
      possibly_sensitive: false,
      public_metrics: {
        like_count: 1000,
        retweet_count: 120,
        reply_count: 30,
        quote_count: 60,
      },
      attachments: { media_keys: ["m1"] },
    }],
    includes: {
      users: [{ id: "u1", username: "catposter", name: "Cat Poster", public_metrics: { followers_count: 5000 } }],
      media: [{ media_key: "m1", type: "photo", url: "https://example.com/cat.jpg", width: 1024, height: 1024 }],
    },
  });
};

const {
  fetchXAttention,
  getXThrottleState,
  resetXThrottleState,
} = await import("../providers/xProvider.js");

resetXThrottleState();
const first = await fetchXAttention();
const afterFirst = getXThrottleState();
const second = await fetchXAttention();
const afterSecond = getXThrottleState();

resetXThrottleState({
  posts: first,
  fetchedAt: Date.now() - 120 * 60 * 1000,
  requestCount: 2,
});
const callsBeforeBudget = fetchCalls;
const budgetReuse = await fetchXAttention();
const callsAfterBudget = fetchCalls;

console.log("X throttle test");
console.log(`First posts: ${first.length}`);
console.log(`Fetch calls after first: ${fetchCalls}`);
console.log(`Second reused: ${second.length === first.length ? "yes" : "no"}`);
console.log(`Request count after second: ${afterSecond.requestCount}`);
console.log(`Budget reused cache: ${budgetReuse.length === first.length ? "yes" : "no"}`);
console.log(`Budget fetch calls changed: ${callsAfterBudget - callsBeforeBudget}`);

if (first.length !== 1) process.exitCode = 1;
if (fetchCalls !== 1) process.exitCode = 1;
if (second.length !== first.length) process.exitCode = 1;
if (afterFirst.requestCount !== 1 || afterSecond.requestCount !== 1) process.exitCode = 1;
if (budgetReuse.length !== first.length) process.exitCode = 1;
if (callsAfterBudget !== callsBeforeBudget) process.exitCode = 1;
