// ============================================================
// Test OINK private signer safety gates
// Run: npm run test-private-signer-safety
// ============================================================

import { spawnSync } from "node:child_process";
import nacl from "tweetnacl";

const deployKeypair = nacl.sign.keyPair();
const treasuryKeypair = nacl.sign.keyPair();
const feeKeypair = nacl.sign.keyPair();
const monitoringKeypair = nacl.sign.keyPair();

const deployPublicKey = encodeBase58(Array.from(deployKeypair.publicKey));
const deploySecretJson = JSON.stringify(Array.from(deployKeypair.secretKey));
const deploySecretBase58 = encodeBase58(Array.from(deployKeypair.secretKey));

setRequiredTestEnv();
process.env.ENABLE_REAL_LAUNCHES = "false";
process.env.SIGNER_DISABLED = "true";
process.env.DEPLOY_WALLET_PUBLIC_KEY = deployPublicKey;
process.env.DEPLOY_WALLET_PRIVATE_KEY = deploySecretJson;
process.env.TREASURY_WALLET_PUBLIC_KEY = encodeBase58(Array.from(treasuryKeypair.publicKey));
process.env.FEE_WALLET_PUBLIC_KEY = encodeBase58(Array.from(feeKeypair.publicKey));
process.env.MONITORING_WALLET_PUBLIC_KEY = encodeBase58(Array.from(monitoringKeypair.publicKey));

const { getDeployPrivateSignerDiagnostics, signDeploymentPayload } = await import("../privateSigner.js");
const { createSignerIsolationManager } = await import("../walletIsolation.js");

const disabledDiagnostics = getDeployPrivateSignerDiagnostics();
const disabledSignature = signDeploymentPayload({ payload: { ticker: "SAFE" } });
const monitoringDenied = createSignerIsolationManager({ disabled: false }).signDeployment({
  role: "monitoring_wallet",
  payload: { ticker: "SAFE" },
});

const liveBase58 = runChildSignerCheck({
  enableRealLaunches: "true",
  signerDisabled: "false",
  deployPublicKey,
  deployPrivateKey: deploySecretBase58,
  treasuryPublicKey: process.env.TREASURY_WALLET_PUBLIC_KEY,
  feePublicKey: process.env.FEE_WALLET_PUBLIC_KEY,
  monitoringPublicKey: process.env.MONITORING_WALLET_PUBLIC_KEY,
});

const mismatch = runChildSignerCheck({
  enableRealLaunches: "true",
  signerDisabled: "false",
  deployPublicKey: process.env.TREASURY_WALLET_PUBLIC_KEY,
  deployPrivateKey: deploySecretJson,
  treasuryPublicKey: deployPublicKey,
  feePublicKey: process.env.FEE_WALLET_PUBLIC_KEY,
  monitoringPublicKey: process.env.MONITORING_WALLET_PUBLIC_KEY,
});

console.log("Private signer safety test");
console.log(`Private key present: ${disabledDiagnostics.privateKeyPresent ? "true" : "false"}`);
console.log(`Public key match: ${disabledDiagnostics.publicKeyMatch ? "true" : "false"}`);
console.log(`Signer enabled: ${disabledDiagnostics.signerEnabled ? "true" : "false"}`);
console.log(`Live signer ready: ${disabledDiagnostics.liveSignerReady ? "true" : "false"}`);
console.log(`Disabled signing refused: ${disabledSignature.signed ? "false" : "true"}`);
console.log(`Monitoring wallet cannot sign: ${monitoringDenied.signed ? "false" : "true"}`);
console.log(`Base58 live gate can sign: ${liveBase58.ok ? "true" : "false"}`);
console.log(`Mismatched private/public refused: ${mismatch.ok ? "false" : "true"}`);

if (!disabledDiagnostics.privateKeyPresent) process.exitCode = 1;
if (!disabledDiagnostics.publicKeyMatch) process.exitCode = 1;
if (disabledDiagnostics.signerEnabled) process.exitCode = 1;
if (disabledDiagnostics.liveSignerReady) process.exitCode = 1;
if (disabledSignature.signed) process.exitCode = 1;
if (monitoringDenied.signed) process.exitCode = 1;
if (!liveBase58.ok) process.exitCode = 1;
if (mismatch.ok) process.exitCode = 1;

function runChildSignerCheck({
  enableRealLaunches,
  signerDisabled,
  deployPublicKey,
  deployPrivateKey,
  treasuryPublicKey,
  feePublicKey,
  monitoringPublicKey,
}) {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { getDeployPrivateSignerDiagnostics, signDeploymentPayload } = await import("./src/privateSigner.js");
        const diagnostics = getDeployPrivateSignerDiagnostics();
        const signed = signDeploymentPayload({ payload: { ticker: "SAFE" } });
        if (!diagnostics.privateKeyPresent || !diagnostics.publicKeyMatch || !diagnostics.signerEnabled || !diagnostics.liveSignerReady || !signed.signed) process.exit(1);
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ENABLE_REAL_LAUNCHES: enableRealLaunches,
        SIGNER_DISABLED: signerDisabled,
        DEPLOY_WALLET_PUBLIC_KEY: deployPublicKey,
        DEPLOY_WALLET_PRIVATE_KEY: deployPrivateKey,
        TREASURY_WALLET_PUBLIC_KEY: treasuryPublicKey,
        FEE_WALLET_PUBLIC_KEY: feePublicKey,
        MONITORING_WALLET_PUBLIC_KEY: monitoringPublicKey,
      },
      encoding: "utf8",
    },
  );
  return { ok: child.status === 0, stderr: child.stderr };
}

function setRequiredTestEnv() {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
}

function encodeBase58(bytes) {
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
