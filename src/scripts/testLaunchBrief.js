import { scoreTrend } from "../scoring.js";
import { scoreLaunchOpportunity } from "../launchScoring.js";
import { generateLaunchBrief } from "../launchBrief.js";
import { preparePumpFunLaunch } from "../launchers/pumpfun.js";

const mockTrend = {
  id: "hashtag-oink-test",
  name: "#OfficePiggyBank",
  type: "hashtag",
  totalViews: 82_000_000,
  videoCount: 18_500,
  rank: 7,
  rankChange: 31,
  rankChangeType: 3,
  acceleration: 1.8,
  trendDirection: "rising",
  discoveredAt: new Date().toISOString(),
  earliestVideo: Math.floor((Date.now() - 18 * 3600000) / 1000),
};

const trendScore = scoreTrend(mockTrend);
const launchScore = scoreLaunchOpportunity(mockTrend, null, null);
const launchBrief = generateLaunchBrief({
  trend: mockTrend,
  trendScore,
  launchScore,
  token: null,
});
const preparedLaunch = preparePumpFunLaunch(launchBrief);

console.log("OINK launch score:");
console.log(JSON.stringify(launchScore, null, 2));
console.log("\nOINK launch brief:");
console.log(JSON.stringify(launchBrief, null, 2));
console.log("\nSocial fields:");
console.log(`Suggested Name: ${launchBrief.suggestedName}`);
console.log(`Suggested Ticker: $${launchBrief.suggestedTicker}`);
console.log(`Social Tag: ${launchBrief.socialTag}`);
console.log(`Source Backlink: ${launchBrief.sourceBacklinkText}`);
console.log(`Suggested X Post: ${launchBrief.xLaunchPost || "n/a"}`);
console.log("\nPrepared launch stub:");
console.log(JSON.stringify(preparedLaunch, null, 2));
