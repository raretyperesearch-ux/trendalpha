// ============================================================
// Telegram alert reliability test.
// Validates safe keyboards and fallback delivery without sending.
// ============================================================

import {
  buildSafeInlineKeyboard,
  getTelegramAlertMetrics,
  simulateTelegramFallbackForTest,
} from "../telegram.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeMockApi(failures = []) {
  const calls = [];
  return {
    calls,
    async sendMessage(channelId, text, options = {}) {
      calls.push({ channelId, text, options });
      const failure = failures.shift();
      if (failure) throw new Error(failure);
      return { ok: true };
    },
  };
}

console.log("Testing Telegram safe keyboard builder...\n");

const keyboard = buildSafeInlineKeyboard({
  type: "refresh",
  refreshId: "Very Long Unicode Trend 🚀🐷 With Spaces And Symbols That Would Normally Break Telegram Callback Data ".repeat(3),
});

if (keyboard) {
  const callbackData = keyboard.inline_keyboard?.[0]?.[0]?.callback_data;
  const bytes = Buffer.byteLength(callbackData || "", "utf8");
  console.log(`Refresh callback_data bytes: ${bytes}`);
  assert(bytes <= 64, "callback_data exceeds 64 bytes");
} else {
  console.log("Keyboard disabled by safe mode, as expected when TELEGRAM_SAFE_MODE=true.");
}

const invalidUrlKeyboard = buildSafeInlineKeyboard({
  type: "link",
  url: "javascript:alert(1)",
  urlLabel: "Bad URL",
});
assert(invalidUrlKeyboard === null, "invalid URL button should be rejected");
console.log("Invalid URL button rejected.");

console.log("\nTesting fallback path from BUTTON_DATA_INVALID...");
const buttonFailureApi = makeMockApi(["400: Bad Request: BUTTON_DATA_INVALID"]);
const recovered = await simulateTelegramFallbackForTest(buttonFailureApi, {
  richHtml: "<b>OINK TEST</b>\nRich alert",
  compactHtml: "<b>OINK TEST</b>\nCompact alert",
  minimalText: "OINK TEST\nMinimal alert",
  keyboardAlert: {
    type: "refresh",
    refreshId: "test-refresh",
  },
});
assert(recovered, "fallback should recover after BUTTON_DATA_INVALID");
assert(buttonFailureApi.calls.length >= 2 || process.env.TELEGRAM_SAFE_MODE === "true", "expected retry or safe-mode compact send");
console.log(`Recovered after ${buttonFailureApi.calls.length} call(s).`);

console.log("\nTesting plain-text minimal fallback...");
const htmlFailureApi = makeMockApi([
  "400: Bad Request: can't parse entities",
]);
const minimalRecovered = await simulateTelegramFallbackForTest(htmlFailureApi, {
  richHtml: "<b>OINK TEST</b><broken>",
  compactHtml: "<b>OINK TEST</b><broken>",
  minimalText: "OINK TEST\nPlain text fallback",
});
assert(minimalRecovered, "minimal fallback should recover from HTML rejection");
console.log(`Minimal fallback recovered after ${htmlFailureApi.calls.length} call(s).`);

console.log("\nTelegram alert metrics:");
console.log(JSON.stringify(getTelegramAlertMetrics(), null, 2));
console.log("\n✅ Telegram alert reliability tests passed");
