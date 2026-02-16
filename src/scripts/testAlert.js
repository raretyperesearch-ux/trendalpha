// ============================================================
// TEST: Send a mock alert to verify your Telegram setup
// Run: npm run test-alert
// ============================================================

import { config } from "../config.js";
import { initBot, sendAlert } from "../telegram.js";
import { scoreTrend } from "../scoring.js";

const mockTrend = {
  id: "test-001",
  name: "moo deng remix - @cryptodegen42",
  type: "sound",
  totalViews: 2_300_000,
  videoCount: 840,
  discoveredAt: new Date(Date.now() - 4 * 3600000).toISOString(),
};

const mockToken = {
  source: "dexscreener",
  tokenName: "$MOODENG",
  tokenAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
  chain: "SOL",
  priceUsd: "0.00234",
  marketCap: 4_200_000,
  volume24h: 890_000,
  liquidity: 320_000,
  priceChange24h: 340,
  holders: 2847,
  url: "https://dexscreener.com/solana/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
};

async function main() {
  console.log("🧪 Sending test alert...\n");

  initBot();

  const score = scoreTrend(mockTrend);
  console.log(`Score: ${score.total}/100`);
  console.log("Breakdown:", score.breakdown);
  console.log("");

  // Test 1: Alert WITH token
  console.log("📤 Sending alert WITH token...");
  await sendAlert({ trend: mockTrend, score, token: mockToken });

  await new Promise((r) => setTimeout(r, 2000));

  // Test 2: Alert WITHOUT token (the money alert)
  const noTokenTrend = {
    ...mockTrend,
    id: "test-002",
    name: "#aigirlfriend breakup",
    totalViews: 4_800_000,
    videoCount: 2_100,
    discoveredAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  };
  const noTokenScore = scoreTrend(noTokenTrend);
  console.log("📤 Sending alert WITHOUT token...");
  await sendAlert({ trend: noTokenTrend, score: noTokenScore, token: null });

  console.log("\n✅ Test complete! Check your Telegram channel.");
  process.exit(0);
}

main().catch(console.error);
