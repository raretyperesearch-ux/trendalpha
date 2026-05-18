// ============================================================
// Test OINK public wallet configuration diagnostics
// Run: npm run test-wallet-config
// ============================================================

import { spawnSync } from "node:child_process";

const deployKey = base58Encode(Array.from({ length: 32 }, (_, i) => i + 1));
const treasuryKey = deployKey;
const feeKey = base58Encode(Array.from({ length: 32 }, (_, i) => i + 33));
const monitoringKey = base58Encode(Array.from({ length: 32 }, (_, i) => i + 65));

process.env.SIGNER_DISABLED = "true";
process.env.ENABLE_REAL_LAUNCHES = "false";
process.env.DEPLOY_WALLET_PUBLIC_KEY = deployKey;
process.env.TREASURY_WALLET_PUBLIC_KEY = treasuryKey;
process.env.FEE_WALLET_PUBLIC_KEY = feeKey;
process.env.MONITORING_WALLET_PUBLIC_KEY = monitoringKey;

const { config, isValidSolanaPublicKey } = await import("../config.js");
const { createSignerIsolationManager } = await import("../walletIsolation.js");

const manager = createSignerIsolationManager();
const diagnostics = manager.getDiagnostics();
const duplicateWarnings = diagnostics.flatMap((item) => item.warnings).filter((warning) => warning.startsWith("wallet_reused"));
const liveReady = diagnostics.some((item) => item.liveSignerReady);

console.log("Wallet config test");
console.log(`Deploy public key valid: ${isValidSolanaPublicKey(config.wallets.deployPublicKey) ? "yes" : "no"}`);
console.log(`Signer disabled: ${config.wallets.signerDisabled ? "yes" : "no"}`);
console.log(`Duplicate warning count: ${duplicateWarnings.length}`);
console.log(`Any live signer ready: ${liveReady ? "yes" : "no"}`);
console.log("Diagnostics:");
console.log(JSON.stringify(diagnostics, null, 2));

const liveDuplicate = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./src/config.js')"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ENABLE_REAL_LAUNCHES: "true",
    DEPLOY_WALLET_PUBLIC_KEY: deployKey,
    TREASURY_WALLET_PUBLIC_KEY: deployKey,
    FEE_WALLET_PUBLIC_KEY: "",
    MONITORING_WALLET_PUBLIC_KEY: "",
  },
  encoding: "utf8",
});

console.log(`Live V1 duplicate allowed: ${liveDuplicate.status === 0 ? "yes" : "no"}`);

if (!isValidSolanaPublicKey(config.wallets.deployPublicKey)) process.exitCode = 1;
if (!config.wallets.signerDisabled) process.exitCode = 1;
if (duplicateWarnings.length < 2) process.exitCode = 1;
if (liveReady) process.exitCode = 1;
if (liveDuplicate.status !== 0) process.exitCode = 1;

function base58Encode(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits.reverse().map((digit) => alphabet[digit]).join("");
}
