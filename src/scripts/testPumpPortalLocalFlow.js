// ============================================================
// Test PumpPortal Local Transaction API flow without network/broadcast
// Run: npm run test-pumpportal-local-flow
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
  VANITY_MINT_SUFFIX: "",
  VANITY_MINT_REQUIRE_MATCH: "false",
  PINATA_JWT: "test-pinata-jwt",
  SOLANA_RPC_URL: "https://rpc.example",
});

const { PumpPortalLocalLaunchFlow } = await import("../launchers/pumpPortalLocalFlow.js");

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, method: options.method, body: options.body });
  if (url === "https://example.com/source.png") {
    return new Response(Buffer.from("fake-image"), { status: 200, headers: { "content-type": "image/png" } });
  }
  if (url === "https://uploads.pinata.cloud/v3/files") {
    const index = calls.filter((call) => call.url === url).length;
    return Response.json({ data: { cid: index === 1 ? "bafyImageCid" : "bafyMetadataCid" } });
  }
  if (url === "https://pumpportal.fun/api/trade-local") {
    return new Response(new Uint8Array([1, 2, 3, 4]).buffer, { status: 200 });
  }
  throw new Error(`Unexpected fetch URL: ${url}`);
};

class MockVersionedTransaction {
  static deserialize(bytes) {
    return new MockVersionedTransaction(bytes);
  }
  constructor(bytes) {
    this.bytes = bytes;
    this.signers = [];
  }
  sign(signers) {
    this.signers = signers;
  }
  serialize() {
    return new Uint8Array([9, 9, 9]);
  }
}

class MockConnection {
  constructor() {
    this.sent = false;
  }
  async sendTransaction(tx) {
    if (!tx?.signers?.length) throw new Error("missing tx signers");
    this.sent = true;
    return "mockTxSignature";
  }
  async getSignatureStatuses() {
    return { value: [{ confirmationStatus: "confirmed", err: null }] };
  }
}

const flow = new PumpPortalLocalLaunchFlow({
  fetchImpl,
  VersionedTransactionClass: MockVersionedTransaction,
  ConnectionClass: MockConnection,
  confirmationPollMs: 1,
});

const result = await flow.execute(mockDeploymentAttempt(), { persist: false });

console.log("PumpPortal local flow test");
console.log(`Status: ${result.status}`);
console.log(`Mint: ${result.mint}`);
console.log(`Image URI: ${result.imageUri}`);
console.log(`Metadata URI: ${result.metadataUri}`);
console.log(`Tx: ${result.txSignature}`);
console.log(`Fetch calls: ${calls.length}`);

const tradeCall = calls.find((call) => call.url.endsWith("/trade-local"));
const tradeBody = JSON.parse(tradeCall.body);
if (result.status !== "confirmed") process.exitCode = 1;
if (!result.mint || result.mint.length < 32) process.exitCode = 1;
if (result.imageUri !== "https://ipfs.io/ipfs/bafyImageCid") process.exitCode = 1;
if (result.metadataUri !== "https://ipfs.io/ipfs/bafyMetadataCid") process.exitCode = 1;
if (result.imageCid !== "bafyImageCid") process.exitCode = 1;
if (result.metadataCid !== "bafyMetadataCid") process.exitCode = 1;
if (!Number.isFinite(result.confirmationLatencyMs)) process.exitCode = 1;
if (result.launchScore !== 91) process.exitCode = 1;
if (result.selectedIdentity?.tickerQualityScore !== 98) process.exitCode = 1;
if (tradeBody.action !== "create") process.exitCode = 1;
if (tradeBody.tokenMetadata.uri !== result.metadataUri) process.exitCode = 1;
if (tradeBody.pool !== "pump") process.exitCode = 1;

function mockDeploymentAttempt() {
  return {
    ticker: "BANADOG",
    clusterId: "cluster-banana",
    mode: "LIVE_DISABLED_SKELETON",
    saturationSafety: { allowed: true },
    simulationResult: { status: "success" },
    payload: {
      transactionSimulation: { status: "success" },
      finalLaunchGate: { readyForFutureLiveLaunch: true },
      identity: {
        selected: {
          tickerQualityScore: 98,
          namingQualityScore: 94,
          identityCohesionScore: 91,
        },
      },
      launchContext: {
        launchReadiness: 91,
        launchReasoning: ["cross-community spread", "launch window prime", "identity cohesion high"],
      },
      metadata: {
        name: "Banadog",
        symbol: "BANADOG",
        description: "Banadog is an OINK attention-market candidate prepared from a source viral artifact.",
        twitter: "https://x.com/oink",
        telegram: "https://t.me/oink",
        website: "https://oink.bot",
        sourcePlatform: "x",
        sourceBacklink: "https://x.com/example/status/123",
        imageUpload: {
          imageUrl: "https://example.com/source.png",
          imageSource: "SOURCE POST MEDIA",
          mimeType: "image/png",
        },
      },
    },
  };
}

function setEnv(values) {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}
