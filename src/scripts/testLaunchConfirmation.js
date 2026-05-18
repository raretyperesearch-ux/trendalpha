// ============================================================
// Test Solana confirmation polling helper
// Run: npm run test-launch-confirmation
// ============================================================

setRequiredEnv();

const { confirmSignature } = await import("../launchers/pumpPortalLocalFlow.js");

let calls = 0;
const confirmed = await confirmSignature({
  signature: "mockTx",
  timeoutMs: 100,
  pollMs: 1,
  connection: {
    async getSignatureStatuses() {
      calls += 1;
      return { value: [{ confirmationStatus: calls >= 2 ? "confirmed" : "processed", err: null }] };
    },
  },
});

const failed = await confirmSignature({
  signature: "badTx",
  timeoutMs: 100,
  pollMs: 1,
  connection: {
    async getSignatureStatuses() {
      return { value: [{ confirmationStatus: "processed", err: { InstructionError: [0, "Custom"] } }] };
    },
  },
});

console.log("Launch confirmation test");
console.log(`Confirmed: ${confirmed.confirmed ? "yes" : "no"} in ${confirmed.attempts} attempts`);
console.log(`Failed status: ${failed.status}`);

if (!confirmed.confirmed) process.exitCode = 1;
if (confirmed.attempts < 2) process.exitCode = 1;
if (failed.status !== "failed") process.exitCode = 1;

function setRequiredEnv() {
  process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
  process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
  process.env.SUPABASE_URL ||= "https://example.supabase.co";
  process.env.SUPABASE_KEY ||= "test-key";
}
