// ============================================================
// Test OINK transaction simulation engine
// Run: npm run test-transaction-sim
// ============================================================

import { simulateTransaction } from "../transactionSimulation.js";
import { formatTransactionSimulationAlert } from "../telegram.js";

const attempt = {
  attemptId: "deploy-test",
  ticker: "SPOT",
  payload: {
    token: { symbol: "SPOT", name: "Spotghost" },
    metadata: { image: "https://assets.oink.bot/local/spot.png", hostedMetadataUrl: "https://assets.oink.bot/local/spot.json" },
  },
};

const scenarios = ["success", "timeout", "dropped_tx", "rpc_failure", "duplicate_deploy", "insufficient_funds", "malformed_payload"];
const results = scenarios.map((scenario) => simulateTransaction(attempt, { scenario }));

console.log("Transaction simulation test");
for (const result of results) {
  console.log(`${result.scenario}: status=${result.status} failure=${result.failureClass || "none"} confirm=${result.latencies.confirmationMs}ms recovery=${result.recoveryPath}`);
}
console.log("\nTelegram preview:");
console.log(formatTransactionSimulationAlert({ ...attempt, simulationResult: results[0] }));

if (results[0].status !== "success") process.exitCode = 1;
if (!results.slice(1).every((result) => result.status === "failed" && result.recoveryPath)) process.exitCode = 1;
if (!results.every((result) => result.replayLog.length >= 4)) process.exitCode = 1;
