// ============================================================
// Test public/ops Telegram channel routing.
// Run: npm run test-telegram-routing
// ============================================================

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "-100default";
process.env.PUBLIC_TELEGRAM_CHANNEL_ID = "-100public";
process.env.OPS_TELEGRAM_CHANNEL_ID = "-100ops";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";

const { simulateTelegramFallbackForTest } = await import("../telegram.js");

const api = makeMockApi();
await simulateTelegramFallbackForTest(api, {
  route: "ops",
  richHtml: "<b>OPS</b>",
  compactHtml: "<b>OPS</b>",
  minimalText: "OPS",
});
await simulateTelegramFallbackForTest(api, {
  route: "public",
  richHtml: "<b>PUBLIC</b>",
  compactHtml: "<b>PUBLIC</b>",
  minimalText: "PUBLIC",
});

console.log("Telegram routing test");
console.log(`Ops channel: ${api.calls[0]?.channelId}`);
console.log(`Public channel: ${api.calls[1]?.channelId}`);

if (api.calls[0]?.channelId !== "-100ops") process.exitCode = 1;
if (api.calls[1]?.channelId !== "-100public") process.exitCode = 1;

function makeMockApi() {
  const calls = [];
  return {
    calls,
    async sendMessage(channelId, text, options = {}) {
      calls.push({ channelId, text, options });
      return { ok: true };
    },
  };
}
