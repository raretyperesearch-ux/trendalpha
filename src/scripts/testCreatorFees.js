// ============================================================
// Test PumpPortal collectCreatorFee local flow without network
// Run: npm run test-creator-fees
// ============================================================

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const deploy = Keypair.generate();
const treasury = Keypair.generate();
const fee = Keypair.generate();
const monitoring = Keypair.generate();

setEnv({
  ENABLE_REAL_LAUNCHES: "true",
  SIGNER_DISABLED: "false",
  DEPLOY_WALLET_PUBLIC_KEY: deploy.publicKey.toBase58(),
  DEPLOY_WALLET_PRIVATE_KEY: bs58.encode(deploy.secretKey),
  TREASURY_WALLET_PUBLIC_KEY: treasury.publicKey.toBase58(),
  FEE_WALLET_PUBLIC_KEY: fee.publicKey.toBase58(),
  MONITORING_WALLET_PUBLIC_KEY: monitoring.publicKey.toBase58(),
  SOLANA_RPC_URL: "https://rpc.example",
});

const { CreatorFeeService, buildCreatorFeeDiagnostics } = await import("../creatorFees.js");

const calls = [];
const service = new CreatorFeeService({
  fetchImpl: async (url, options = {}) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
  },
  VersionedTransactionClass: class {
    static deserialize(bytes) { return new this(bytes); }
    constructor(bytes) { this.bytes = bytes; this.signers = []; }
    sign(signers) { this.signers = signers; }
    serialize() { return new Uint8Array([9]); }
  },
  ConnectionClass: class {
    async sendTransaction(tx) {
      if (tx.signers.length !== 1) throw new Error("creator fee should only use deploy signer");
      return "creatorFeeTx";
    }
    async getSignatureStatuses() {
      return { value: [{ confirmationStatus: "confirmed", err: null }] };
    }
  },
  confirmationPollMs: 1,
});

const pumpClaim = await service.collectCreatorFee({ pool: "pump", estimatedCreatorFeesSol: 2.41, persist: false });
const meteoraClaim = await service.collectCreatorFee({ pool: "meteora-dbc", mint: "Mint111111111111111111111111111111111111111", estimatedCreatorFeesSol: 0.5, persist: false });
const diagnostics = buildCreatorFeeDiagnostics({
  deployedTokens: [{ ticker: "BANANA", mint: "Mint111111111111111111111111111111111111111", estimatedCreatorFeesSol: 2.41 }],
  claims: [pumpClaim, meteoraClaim],
});

console.log("Creator fees test");
console.log(`Pump status: ${pumpClaim.status}`);
console.log(`Meteora status: ${meteoraClaim.status}`);
console.log(`Requests: ${calls.map((call) => `${call.body.action}:${call.body.pool}:${call.body.mint || "all"}`).join(" | ")}`);
console.log(`Claimed: ${diagnostics.claimedFees.toFixed(2)} SOL`);

if (pumpClaim.status !== "claimed") process.exitCode = 1;
if (meteoraClaim.status !== "claimed") process.exitCode = 1;
if (calls[0].body.action !== "collectCreatorFee") process.exitCode = 1;
if ("mint" in calls[0].body) process.exitCode = 1;
if (calls[1].body.mint !== "Mint111111111111111111111111111111111111111") process.exitCode = 1;
if (diagnostics.claimedFees < 2.9) process.exitCode = 1;

function setEnv(values) {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}
