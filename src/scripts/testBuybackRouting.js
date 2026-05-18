// ============================================================
// Test future buyback routing placeholders
// Run: npm run test-buyback-routing
// ============================================================

import { createBuybackRoutingPlan } from "../creatorFees.js";
import { BUYBACK_CONFIG } from "../buybacks.js";

const plan = createBuybackRoutingPlan({ treasurySol: 10 });

console.log("Buyback routing test");
console.log(`Status: ${plan.status}`);
console.log(`Automatic buybacks: ${plan.automaticBuybacksEnabled ? "enabled" : "disabled"}`);
console.log(`Buyback percent: ${plan.allocation.buybacksPercent}`);
console.log(`Queued SOL: ${plan.buybackQueue[0]?.plannedSol || 0}`);

if (plan.automaticBuybacksEnabled) process.exitCode = 1;
if (plan.allocation.buybacksPercent !== BUYBACK_CONFIG.buybackPercent) process.exitCode = 1;
if (plan.buybackQueue[0].plannedSol !== 7) process.exitCode = 1;
