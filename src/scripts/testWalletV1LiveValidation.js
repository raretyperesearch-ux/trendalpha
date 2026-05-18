// ============================================================
// Test V1 live wallet validation policy
// Run: npm run test-wallet-v1-live-validation
// ============================================================

import { spawnSync } from "node:child_process";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const deploy = Keypair.generate();
const other = Keypair.generate();

const baseEnv = {
  ...process.env,
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_CHANNEL_ID: "test-channel",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "test-key",
  ENABLE_REAL_LAUNCHES: "true",
  DEPLOY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
  TREASURY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
  FEE_WALLET_PUBLIC_KEY: "",
  MONITORING_WALLET_PUBLIC_KEY: "",
};

const v1Reuse = runChild({
  SIGNER_DISABLED: "true",
  CODE: `
    const { config } = await import("./src/config.js");
    if (!config.wallets.roleConfigValid) process.exit(1);
    if (config.wallets.feePublicKey !== "" || config.wallets.monitoringPublicKey !== "") process.exit(1);
  `,
});

const missingPrivate = runChild({
  SIGNER_DISABLED: "false",
  DEPLOY_WALLET_PRIVATE_KEY: "",
  CODE: `await import("./src/config.js");`,
});

const mismatch = runChild({
  SIGNER_DISABLED: "false",
  DEPLOY_WALLET_PRIVATE_KEY: bs58.encode(other.secretKey),
  CODE: `
    const { getDeployPrivateSignerDiagnostics } = await import("./src/privateSigner.js");
    const diagnostics = getDeployPrivateSignerDiagnostics();
    if (diagnostics.liveSignerReady || diagnostics.reason !== "private_key_public_key_mismatch") process.exit(1);
  `,
});

const ready = runChild({
  SIGNER_DISABLED: "false",
  DEPLOY_WALLET_PRIVATE_KEY: bs58.encode(deploy.secretKey),
  CODE: `
    const { getDeployPrivateSignerDiagnostics } = await import("./src/privateSigner.js");
    const diagnostics = getDeployPrivateSignerDiagnostics();
    if (!diagnostics.liveSignerReady || !diagnostics.roleConfigValid) process.exit(1);
  `,
});

console.log("Wallet V1 live validation test");
console.log(`Deploy=treasury allowed: ${v1Reuse.ok ? "yes" : "no"}`);
console.log(`Fee/monitoring optional: ${v1Reuse.ok ? "yes" : "no"}`);
console.log(`Missing private key hard fails when signer enabled: ${missingPrivate.ok ? "no" : "yes"}`);
console.log(`Mismatched private key refused: ${mismatch.ok ? "yes" : "no"}`);
console.log(`Matching deploy signer live ready: ${ready.ok ? "yes" : "no"}`);

if (!v1Reuse.ok) process.exitCode = 1;
if (missingPrivate.ok) process.exitCode = 1;
if (!mismatch.ok) process.exitCode = 1;
if (!ready.ok) process.exitCode = 1;

function runChild(extraEnv) {
  const code = extraEnv.CODE;
  const env = { ...baseEnv, ...extraEnv };
  delete env.CODE;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  return { ok: child.status === 0, stdout: child.stdout, stderr: child.stderr };
}
