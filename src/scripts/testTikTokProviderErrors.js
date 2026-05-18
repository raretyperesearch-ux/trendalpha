// ============================================================
// Test TikTok provider error diagnostics
// Run: npm run test-tiktok-provider-errors
// ============================================================

const {
  getTikTokApiErrorDiagnostics,
  isFatalTikTokErrorMessage,
  isFatalTikTokUpstreamError,
} = await import("../tiktok.js");

const upstream = getTikTokApiErrorDiagnostics({
  endpointPath: "/api/trending/hashtag",
  status: 200,
  data: { code: 500, msg: "no available es index" },
});

const quota = getTikTokApiErrorDiagnostics({
  endpointPath: "/api/trending/hashtag",
  status: 429,
  data: { message: "You have exceeded your RapidAPI quota" },
});

const unknown = getTikTokApiErrorDiagnostics({
  endpointPath: "/api/trending/hashtag",
  status: 200,
  data: { code: 100, msg: "Unknown error" },
});

console.log("TikTok provider errors test");
console.log(`Upstream fatal: ${upstream.fatal ? "yes" : "no"}`);
console.log(`Upstream index: ${upstream.upstreamIndexError ? "yes" : "no"}`);
console.log(`Quota/plan fatal: ${quota.fatal ? "yes" : "no"}`);
console.log(`Unknown fatal: ${unknown.fatal ? "yes" : "no"}`);

if (!upstream.upstreamIndexError || !upstream.fatal) process.exitCode = 1;
if (!quota.quotaOrPlanInvalid || !quota.fatal) process.exitCode = 1;
if (unknown.fatal) process.exitCode = 1;
if (!isFatalTikTokUpstreamError({ msg: "no available es index" })) process.exitCode = 1;
if (!isFatalTikTokErrorMessage("no available es index")) process.exitCode = 1;
