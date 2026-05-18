// ============================================================
// Test hard live launch gates
// Run: npm run test-live-launch-gates
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

const disabled = runGate({ ENABLE_REAL_LAUNCHES: "false", SIGNER_DISABLED: "true" });
const signerDisabled = runGate({ ENABLE_REAL_LAUNCHES: "true", SIGNER_DISABLED: "true" });
const ready = runGate({ ENABLE_REAL_LAUNCHES: "true", SIGNER_DISABLED: "false" });

console.log("Live launch gates test");
console.log(`Disabled blocks: ${disabled.errors.join(", ")}`);
console.log(`Signer disabled blocks: ${signerDisabled.errors.join(", ")}`);
console.log(`Ready allowed: ${ready.allowed ? "yes" : "no"}`);

if (!disabled.errors.includes("real_launches_disabled")) process.exitCode = 1;
if (!signerDisabled.errors.includes("signer_disabled")) process.exitCode = 1;
if (!ready.allowed) process.exitCode = 1;

function runGate(env) {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { PumpPortalLocalLaunchFlow } = await import("./src/launchers/pumpPortalLocalFlow.js");
        const flow = new PumpPortalLocalLaunchFlow({ pinataJwt: "pinata", rpcUrl: "https://rpc.example" });
        const result = flow.validateLaunchGates({
          ticker: "OINK",
          saturationSafety: { allowed: true },
          simulationResult: { status: "success" },
          payload: {
            transactionSimulation: { status: "success" },
            finalLaunchGate: { readyForFutureLiveLaunch: true },
            identity: { selected: { tickerQualityScore: 90, namingQualityScore: 90, identityCohesionScore: 90 } }
          }
        });
        console.log(JSON.stringify(result));
      `,
    ],
    {
      cwd: process.cwd(),
      env: { ...baseEnv, ...env },
      encoding: "utf8",
    },
  );
  if (child.status !== 0) return { allowed: false, errors: ["child_failed"] };
  return JSON.parse(child.stdout.trim());
}
