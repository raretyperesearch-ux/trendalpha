// ============================================================
// Test public Telegram buyback/flywheel copy hides allocations
// Run: npm run test-telegram-buyback-copy
// ============================================================

import { getBuybackSummary } from "../buybacks.js";
import { formatLaunchCandidateMessage, formatLaunchCreatedAlert } from "../telegram.js";

const trend = {
  id: "x-1",
  sourcePlatform: "x",
  sourceUrl: "https://x.com/example/status/1",
  name: "Banana Dog",
  author: "example",
  totalViews: 1000000,
  viewsPerHour: 100000,
  shareCount: 1200,
  shareVelocity: 120,
  quoteCount: 400,
  repostCount: 800,
  mediaType: "photo",
  attentionShapeScore: 100000,
};

const launchBrief = {
  sourceUrl: trend.sourceUrl,
  suggestedName: "Banana Dog",
  suggestedTicker: "BANANADOG",
  thesis: "Viral X attention is forming before a canonical market exists.",
  socialTag: "#BananaDog",
  sourceBacklinkText: `Launched from this viral X post: ${trend.sourceUrl}`,
  xLaunchPost: "OINK detected viral attention before a market existed.",
  riskFlags: [],
};

const launchCandidate = formatLaunchCandidateMessage({
  trend,
  trendScore: { total: 88 },
  launchScore: {
    total: 91,
    label: "EXTREME",
    reasons: ["High X engagement velocity", "No obvious crypto saturation"],
  },
  launchBrief,
  preparedLaunch: { note: "Launch prepared only. No transaction submitted." },
});

const created = formatLaunchCreatedAlert({
  trend,
  launchBrief,
  launchedToken: {
    name: "Banana Dog",
    ticker: "BANANADOG",
    contractAddress: "So11111111111111111111111111111111111111112",
    launchUrl: "https://pump.fun/example",
    imageSource: "SOURCE POST MEDIA",
    buybackRoute: "pending",
    launchScore: 91,
  },
  feeSummary: "Current model: 70% buybacks, 20% treasury, 10% ops.",
});

const combined = [getBuybackSummary(), launchCandidate, created].join("\n");

console.log("Telegram buyback copy test");
console.log(getBuybackSummary());
console.log(`Candidate has source link: ${launchCandidate.includes("Source Tweet") ? "yes" : "no"}`);
console.log(`Percentages hidden: ${/\b(70|20|10)%\b/.test(combined) ? "no" : "yes"}`);

if (!getBuybackSummary().includes("Autonomous launch fees route back toward $OINK buybacks.")) process.exitCode = 1;
if (!launchCandidate.includes("Autonomous launch fees route back toward $OINK buybacks.")) process.exitCode = 1;
if (!launchCandidate.includes("Source Tweet")) process.exitCode = 1;
if (/\b(70|20|10)%\b/.test(combined)) process.exitCode = 1;
if (/Current model/i.test(combined)) process.exitCode = 1;
