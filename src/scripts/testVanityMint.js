// ============================================================
// Test vanity mint generation for PumpPortal local launches
// Run: npm run test-vanity-mint
// ============================================================

import { spawnSync } from "node:child_process";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const found = runCase({
  VANITY_MINT_SUFFIX: "oink",
  VANITY_MINT_MAX_ATTEMPTS: "5",
  VANITY_MINT_TIMEOUT_MS: "10000",
  VANITY_MINT_CASE_INSENSITIVE: "true",
  VANITY_MINT_REQUIRE_MATCH: "true",
  PUBLIC_KEYS: "Mint111111111111111111111111111111111111111|Mint2222222222222222222222222222222222oInK",
});

const requiredBlocked = runCase({
  VANITY_MINT_SUFFIX: "oink",
  VANITY_MINT_MAX_ATTEMPTS: "2",
  VANITY_MINT_TIMEOUT_MS: "10000",
  VANITY_MINT_CASE_INSENSITIVE: "true",
  VANITY_MINT_REQUIRE_MATCH: "true",
  PUBLIC_KEYS: "Mint111111111111111111111111111111111111111|Mint222222222222222222222222222222222222222",
});

const emptySuffix = runCase({
  VANITY_MINT_SUFFIX: "",
  VANITY_MINT_REQUIRE_MATCH: "false",
  PUBLIC_KEYS: "RandomMint111111111111111111111111111111111111",
});
const blockedLaunch = runBlockedLaunchCase();

console.log("Vanity mint test");
console.log(`Found suffix: ${found.diagnostics.suffixFound ? "yes" : "no"} attempts=${found.diagnostics.attempts}`);
console.log(`Required blocked: ${requiredBlocked.keypair ? "no" : "yes"} reason=${requiredBlocked.diagnostics.blockedReason}`);
console.log(`Empty suffix random: ${emptySuffix.keypair ? "yes" : "no"} requested=${emptySuffix.diagnostics.suffixRequested || "none"}`);
console.log(`Required no-match blocks launch: ${blockedLaunch.status === "blocked" ? "yes" : "no"} fetchCalls=${blockedLaunch.fetchCalls}`);

if (!found.keypair || !found.diagnostics.suffixFound || found.diagnostics.attempts !== 2) process.exitCode = 1;
if (requiredBlocked.keypair || requiredBlocked.diagnostics.blockedReason !== "vanity_mint_not_found") process.exitCode = 1;
if (!emptySuffix.keypair || emptySuffix.diagnostics.suffixRequested !== "") process.exitCode = 1;
if (blockedLaunch.status !== "blocked" || blockedLaunch.blockedReason !== "vanity_mint_not_found" || blockedLaunch.fetchCalls !== 0) process.exitCode = 1;

function runCase(env) {
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const keys = process.env.PUBLIC_KEYS.split("|");
        class MockKeypair {
          static generate() {
            const publicKey = keys.shift() || "FallbackMint111111111111111111111111111111111";
            return { publicKey: { toBase58: () => publicKey } };
          }
        }
        const { PumpPortalLocalLaunchFlow } = await import("./src/launchers/pumpPortalLocalFlow.js");
        const flow = new PumpPortalLocalLaunchFlow({ KeypairClass: MockKeypair });
        const result = flow.generateMintKeypair();
        console.log(JSON.stringify({ keypair: Boolean(result.keypair), diagnostics: result.diagnostics }));
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_CHANNEL_ID: "test-channel",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_KEY: "test-key",
        ...env,
      },
      encoding: "utf8",
    },
  );
  if (child.status !== 0) {
    console.error(child.stdout);
    console.error(child.stderr);
    return { keypair: false, diagnostics: { blockedReason: "child_failed", suffixFound: false, attempts: 0 } };
  }
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

function runBlockedLaunchCase() {
  const deploy = Keypair.generate();
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        let fetchCalls = 0;
        class MockKeypair {
          static generate() {
            return { publicKey: { toBase58: () => "Mint111111111111111111111111111111111111111" } };
          }
        }
        const { PumpPortalLocalLaunchFlow } = await import("./src/launchers/pumpPortalLocalFlow.js");
        const flow = new PumpPortalLocalLaunchFlow({
          KeypairClass: MockKeypair,
          fetchImpl: async () => {
            fetchCalls += 1;
            throw new Error("fetch should not be called");
          },
        });
        const result = await flow.execute({
          ticker: "BANADOG",
          clusterId: "cluster-banana",
          saturationSafety: { allowed: true },
          simulationResult: { status: "success" },
          payload: {
            transactionSimulation: { status: "success" },
            finalLaunchGate: { readyForFutureLiveLaunch: true },
            identity: { selected: { tickerQualityScore: 98, namingQualityScore: 94, identityCohesionScore: 91 } },
            metadata: {
              name: "Banadog",
              symbol: "BANADOG",
              description: "Banadog is an OINK attention-market candidate.",
              imageUpload: { imageUrl: "https://example.com/source.png", imageSource: "SOURCE POST MEDIA" },
            },
          },
        }, { persist: false });
        console.log(JSON.stringify({ ...result, fetchCalls }));
      `,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_CHANNEL_ID: "test-channel",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_KEY: "test-key",
        ENABLE_REAL_LAUNCHES: "true",
        SIGNER_DISABLED: "false",
        DEPLOY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
        DEPLOY_WALLET_PRIVATE_KEY: bs58.encode(deploy.secretKey),
        TREASURY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
        FEE_WALLET_PUBLIC_KEY: "",
        MONITORING_WALLET_PUBLIC_KEY: "",
        PINATA_JWT: "pinata",
        SOLANA_RPC_URL: "https://rpc.example",
        VANITY_MINT_SUFFIX: "oink",
        VANITY_MINT_MAX_ATTEMPTS: "2",
        VANITY_MINT_TIMEOUT_MS: "10000",
        VANITY_MINT_REQUIRE_MATCH: "true",
      },
      encoding: "utf8",
    },
  );
  if (child.status !== 0) {
    console.error(child.stdout);
    console.error(child.stderr);
    return { status: "child_failed", blockedReason: "child_failed", fetchCalls: -1 };
  }
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}
