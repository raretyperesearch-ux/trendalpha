// ============================================================
// Test creator fee treasury sweep planning
// Run: npm run test-treasury-sweeps
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

const { CreatorFeeService } = await import("../creatorFees.js");
const { formatTreasuryUpdateAlert } = await import("../telegram.js");

const service = new CreatorFeeService({
  fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
  VersionedTransactionClass: class {
    static deserialize(bytes) { return new this(bytes); }
    constructor(bytes) { this.bytes = bytes; this.signers = []; }
    sign(signers) { this.signers = signers; }
    serialize() { return new Uint8Array([9]); }
  },
  ConnectionClass: class {
    async sendTransaction() { return "sweepTx"; }
    async getSignatureStatuses() { return { value: [{ confirmationStatus: "confirmed", err: null }] }; }
  },
  confirmationPollMs: 1,
});

const diagnostics = await service.sweepCreatorFees({
  deployedTokens: [
    { ticker: "BANANA", mint: "MintA11111111111111111111111111111111111111", estimatedCreatorFeesSol: 2.41 },
    { ticker: "SPOT", mint: "MintB111111111111111111111111111111111111111", estimatedCreatorFeesSol: 0.31 },
  ],
  pools: ["pump"],
  persist: false,
});

console.log("Treasury sweeps test");
console.log(`Claimed: ${diagnostics.claimedFees.toFixed(2)} SOL`);
console.log(`Top launch: $${diagnostics.topLaunch.ticker}`);
console.log(formatTreasuryUpdateAlert({ diagnostics }));

if (diagnostics.claimedFees < 2.7) process.exitCode = 1;
if (diagnostics.topLaunch.ticker !== "BANANA") process.exitCode = 1;

function setEnv(values) {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}
