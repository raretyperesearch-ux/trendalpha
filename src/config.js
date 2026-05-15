import "dotenv/config";

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key} — check your .env file`);
  return val;
};

const optional = (key, fallback) => process.env[key] || fallback;
const optionalBool = (key, fallback) => {
  const val = optional(key, fallback ? "true" : "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(val);
};

export const config = {
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    channelId: required("TELEGRAM_CHANNEL_ID"),
  },
  supabase: {
    url: required("SUPABASE_URL"),
    key: required("SUPABASE_KEY"),
  },
  birdeye: {
    apiKey: optional("BIRDEYE_API_KEY", ""),
  },
  scan: {
    intervalMinutes: parseInt(optional("SCAN_INTERVAL_MINUTES", "15")),
    minScore: parseInt(optional("MIN_SCORE_TO_ALERT", "70")),
  },
  launch: {
    minLaunchScore: parseInt(optional("MIN_LAUNCH_SCORE", "82")),
    enableLaunchCandidates: optionalBool("ENABLE_LAUNCH_CANDIDATES", true),
  },
};
