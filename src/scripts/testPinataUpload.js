// ============================================================
// Test Pinata upload wrapper without network
// Run: npm run test-pinata-upload
// ============================================================

setRequiredEnv();

const { uploadPinataLaunchAsset } = await import("../launchers/pumpPortalLocalFlow.js");

let captured = null;
const result = await uploadPinataLaunchAsset(
  {
    filename: "oink.png",
    contentType: "image/png",
    buffer: Buffer.from("fake"),
  },
  {
    pinataJwt: "pinata-test",
    fetchImpl: async (url, options) => {
      captured = { url, method: options.method, auth: options.headers.Authorization, bodyType: options.body.constructor.name };
      return Response.json({ data: { cid: "bafyPinataCid" } });
    },
  },
);

console.log("Pinata upload test");
console.log(`CID: ${result.cid}`);
console.log(`Endpoint: ${captured.url}`);
console.log(`Auth header: ${captured.auth ? "present" : "missing"}`);
console.log(`Body: ${captured.bodyType}`);

if (result.cid !== "bafyPinataCid") process.exitCode = 1;
if (captured.url !== "https://uploads.pinata.cloud/v3/files") process.exitCode = 1;
if (captured.auth !== "Bearer pinata-test") process.exitCode = 1;

function setRequiredEnv() {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
}
