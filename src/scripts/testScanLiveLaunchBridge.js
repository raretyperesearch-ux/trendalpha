// ============================================================
// Test scanner live launch bridge gates
// Run: npm run test-scan-live-launch-bridge
// ============================================================

import { spawnSync } from "node:child_process";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const deploy = Keypair.generate();
const treasury = Keypair.generate();
const fee = Keypair.generate();
const monitoring = Keypair.generate();

const baseEnv = {
  ...process.env,
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_CHANNEL_ID: "test-channel",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "test-key",
  DEPLOY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
  DEPLOY_WALLET_PRIVATE_KEY: bs58.encode(deploy.secretKey),
  TREASURY_WALLET_PUBLIC_KEY: treasury.publicKey.toBase58(),
  FEE_WALLET_PUBLIC_KEY: fee.publicKey.toBase58(),
  MONITORING_WALLET_PUBLIC_KEY: monitoring.publicKey.toBase58(),
  PINATA_JWT: "pinata",
  SOLANA_RPC_URL: "https://rpc.example",
};

const disabled = runBridge({
  ENABLE_REAL_LAUNCHES: "false",
  ENABLE_LIVE_LAUNCH_FROM_SCAN: "false",
  SIGNER_DISABLED: "true",
});
const liveFlagMissing = runBridge({
  ENABLE_REAL_LAUNCHES: "true",
  ENABLE_LIVE_LAUNCH_FROM_SCAN: "false",
  SIGNER_DISABLED: "false",
});
const canonicalBlocked = runBridge({
  ENABLE_REAL_LAUNCHES: "true",
  ENABLE_LIVE_LAUNCH_FROM_SCAN: "true",
  SIGNER_DISABLED: "false",
  TOKEN_STATUS: "canonical",
});
const ready = runBridge({
  ENABLE_REAL_LAUNCHES: "true",
  ENABLE_LIVE_LAUNCH_FROM_SCAN: "true",
  SIGNER_DISABLED: "false",
});

console.log("Scan live launch bridge test");
console.log(`Disabled: ${disabled.status} ${disabled.decision.blocks.join(", ")}`);
console.log(`Live flag missing: ${liveFlagMissing.status} ${liveFlagMissing.decision.blocks.join(", ")}`);
console.log(`Canonical blocked: ${canonicalBlocked.status} ${canonicalBlocked.decision.blocks.join(", ")}`);
console.log(`Ready execution: ${ready.status}`);

if (!disabled.decision.blocks.includes("ENABLE_REAL_LAUNCHES=false")) process.exitCode = 1;
if (!liveFlagMissing.decision.blocks.includes("ENABLE_LIVE_LAUNCH_FROM_SCAN=false")) process.exitCode = 1;
if (!canonicalBlocked.decision.blocks.includes("canonical_market_already_exists")) process.exitCode = 1;
if (ready.status !== "confirmed") process.exitCode = 1;

function runBridge(env) {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { maybeExecuteLiveLaunchFromScan } = await import("./src/liveLaunchBridge.js");
        const attempt = {
          ticker: "BANADOG",
          clusterId: "cluster-banana",
          saturationSafety: { allowed: true },
          simulationResult: { status: "success" },
          payload: {
            transactionSimulation: { status: "success" },
            finalLaunchGate: {
              readyForFutureLiveLaunch: true,
              checks: {
                walletConfigValid: true,
                liveSignerReady: true,
                saturationSafetyPassed: true,
                transactionSimulationSuccess: true,
              },
            },
            identity: {
              selected: {
                tickerQualityScore: 98,
                namingQualityScore: 94,
                identityCohesionScore: 91,
              },
            },
            metadata: {
              name: "Banadog",
              symbol: "BANADOG",
              image: "https://ipfs.io/ipfs/bafyImage",
              hostedMetadataUrl: "https://ipfs.io/ipfs/bafyMetadata",
              sourcePlatform: "x",
              sourceBacklink: "https://x.com/example/status/123",
            },
            finalMetadataPreview: {
              imageUrl: "https://ipfs.io/ipfs/bafyImage",
              metadataUrl: "https://ipfs.io/ipfs/bafyMetadata",
            },
          },
        };
        const token = process.env.TOKEN_STATUS ? { matchStatus: process.env.TOKEN_STATUS } : null;
        const result = await maybeExecuteLiveLaunchFromScan(attempt, {
          token,
          sourcePlatform: "x",
          persistFailure: false,
          executeImpl: async () => ({
            status: "confirmed",
            mint: "Mint111111111111111111111111111111111111111",
            txSignature: "mockTxSignature",
          }),
        });
        console.log("RESULT:" + JSON.stringify(result));
      `,
    ],
    {
      cwd: process.cwd(),
      env: { ...baseEnv, ...env },
      encoding: "utf8",
    },
  );
  if (child.status !== 0) {
    console.error(child.stdout);
    console.error(child.stderr);
    return { status: "child_failed", decision: { blocks: ["child_failed"] } };
  }
  const line = child.stdout.trim().split("\n").findLast((entry) => entry.startsWith("RESULT:"));
  return JSON.parse(line.replace("RESULT:", ""));
}
