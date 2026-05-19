// ============================================================
// Standalone TikTok RapidAPI live provider smoke test
// Run: npm run test-tiktok-live-provider
// ============================================================

import https from "node:https";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const HOST = process.env.TIKTOK_RAPIDAPI_HOST || "tiktok-creative-center-api.p.rapidapi.com";
const ENDPOINT = "/api/trending/hashtag?period=7&limit=20&page=1&country_code=US";

if (!RAPIDAPI_KEY.trim()) {
  console.error("RAPIDAPI_KEY is required for test-tiktok-live-provider");
  process.exit(1);
}

let response;
try {
  response = await requestTikTok();
} catch (err) {
  console.error(`TikTok live provider request failed: ${err.message}`);
  process.exit(1);
}

const data = parseJson(response.body);
const apiCode = data?.code ?? data?.status ?? "n/a";
const apiMessage = data?.msg || data?.message || data?.error || "";
const list = Array.isArray(data?.data?.list) ? data.data.list : [];
const trendNames = list
  .slice(0, 3)
  .map((item) => item.hashtag_name || item.name || item.title || item.keyword || "")
  .filter(Boolean);
const isError = response.status < 200 || response.status >= 300 || apiCode !== 0 || !Array.isArray(data?.data?.list);

console.log("TikTok live provider smoke test");
console.log(`host=${HOST}`);
console.log(`endpoint=${ENDPOINT}`);
console.log(`http_status=${response.status}`);
console.log(`api_code=${apiCode}`);
console.log(`api_msg=${apiMessage || "none"}`);
console.log(`list_length=${list.length}`);
console.log(`first_3_raw_trend_names=${trendNames.join(" | ") || "none"}`);

if (isError) {
  console.log(`response_body_snippet=${response.body.slice(0, 700)}`);
}

if (/no available es index/i.test(apiMessage) || /no available es index/i.test(response.body)) {
  console.log("TikTok RapidAPI provider backend unavailable or endpoint changed.");
}

if (isError) process.exitCode = 1;

function requestTikTok() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path: ENDPOINT,
        method: "GET",
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": HOST,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.end();
  });
}

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
