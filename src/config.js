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
const optionalInt = (key, fallback) => parseInt(optional(key, fallback), 10);
const optionalList = (key) => {
  const val = optional(key, "");
  if (!val.trim()) return [];
  return val
    .split(/\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean);
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
    intervalMinutes: optionalInt("SCAN_INTERVAL_MINUTES", "15"),
    minScore: optionalInt("MIN_SCORE_TO_ALERT", "70"),
  },
  launch: {
    minLaunchScore: optionalInt("MIN_LAUNCH_SCORE", "82"),
    enableLaunchCandidates: optionalBool("ENABLE_LAUNCH_CANDIDATES", true),
  },
  providers: {
    tiktok: optionalBool("ENABLE_TIKTOK_PROVIDER", true),
    x: optionalBool("ENABLE_X_PROVIDER", true),
  },
  x: {
    bearerToken: optional("X_BEARER_TOKEN", ""),
    searchQueries: optionalList("X_SEARCH_QUERIES"),
    minViews: optionalInt("X_MIN_VIEWS", "100000"),
    minLikes: optionalInt("X_MIN_LIKES", "3000"),
    minShares: optionalInt("X_MIN_SHARES", "500"),
    minShareVelocity: optionalInt("X_MIN_SHARE_VELOCITY", "100"),
    minViewsPerHour: optionalInt("X_MIN_VIEWS_PER_HOUR", "50000"),
    maxPostAgeHours: optionalInt("X_MAX_POST_AGE_HOURS", "12"),
    resultsPerQuery: optionalInt("X_RESULTS_PER_QUERY", "25"),
  },
};
