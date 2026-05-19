// ============================================================
// Test universal Telegram footer.
// Run: npm run test-telegram-footer
// ============================================================

process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_CHANNEL_ID ||= "test-channel";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.TELEGRAM_FOOTER_ENABLED = "true";
process.env.TELEGRAM_FOOTER_TEXT = "Save 40% on all fees:";
process.env.TELEGRAM_FOOTER_LINK_LABEL = "Padre";
process.env.TELEGRAM_FOOTER_URL = "https://trade.padre.gg/rk/raretype";

const {
  appendTelegramFooter,
  simulateTelegramFallbackForTest,
} = await import("../telegram.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const base = "<b>OINK TEST</b>\nSignal body";
const withFooter = appendTelegramFooter(base);
const duplicated = appendTelegramFooter(withFooter);

console.log("Telegram footer test");
console.log(`Footer appended: ${withFooter.includes(">Padre</a>") ? "yes" : "no"}`);
console.log(`Raw visible URL: ${visibleText(withFooter).includes("https://trade.padre.gg/rk/raretype") ? "yes" : "no"}`);
console.log(`Duplicate prevented: ${withFooter === duplicated ? "yes" : "no"}`);

assert(withFooter.includes("<b>Save 40% on all fees:</b>"), "footer text missing");
assert(withFooter.includes('<a href="https://trade.padre.gg/rk/raretype">Padre</a>'), "footer hidden link missing");
assert(!visibleText(withFooter).includes("https://trade.padre.gg/rk/raretype"), "raw URL should not be visible text");
assert(withFooter === duplicated, "footer should not duplicate");

const api = makeMockApi();
const recovered = await simulateTelegramFallbackForTest(api, {
  richHtml: "<b>OINK TEST</b>\nRich alert",
  compactHtml: "<b>OINK TEST</b>\nCompact alert",
  minimalText: "OINK TEST\nMinimal alert",
});

assert(recovered, "fallback simulation should send");
assert(api.calls.length >= 1, "expected at least one send call");
for (const call of api.calls) {
  assert(call.text.includes(">Padre</a>"), "sent message missing footer link");
  assert(call.options.parse_mode === "HTML", "footer messages should use HTML parse mode");
  assert(!visibleText(call.text).includes("https://trade.padre.gg/rk/raretype"), "sent visible text exposes raw URL");
}

console.log(`Send calls checked: ${api.calls.length}`);
console.log("✅ Telegram footer tests passed");

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

function visibleText(html = "") {
  return String(html)
    .replace(/<a\s+href="[^"]+">([^<]+)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "");
}
