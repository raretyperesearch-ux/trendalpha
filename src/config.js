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
    safeMode: optionalBool("TELEGRAM_SAFE_MODE", true),
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
  tokenMatching: {
    enabled: optionalBool("ENABLE_EXISTING_TOKEN_MATCHING", true),
    confidenceThreshold: Number(optional("TOKEN_MATCH_CONFIDENCE_THRESHOLD", "0.90")),
    possibleThreshold: Number(optional("TOKEN_POSSIBLE_THRESHOLD", "0.50")),
    launchIfNoMarket: optionalBool("X_LAUNCH_IF_NO_MARKET", true),
  },
  launch: {
    minLaunchScore: optionalInt("MIN_LAUNCH_SCORE", "82"),
    enableLaunchCandidates: optionalBool("ENABLE_LAUNCH_CANDIDATES", true),
    memoryOnlyLaunchTestMode: optionalBool("MEMORY_ONLY_LAUNCH_TEST_MODE", false),
    enableRealLaunches: optionalBool("ENABLE_REAL_LAUNCHES", false),
    deploymentMinReadiness: optionalInt("DEPLOYMENT_MIN_LAUNCH_READINESS", "80"),
    deploymentMaxSwarmPressure: optionalInt("DEPLOYMENT_MAX_SWARM_PRESSURE", "40"),
  },
  pumpPortal: {
    apiBaseUrl: optional("PUMPPORTAL_API_BASE_URL", "https://pumpportal.fun/api"),
  },
  metadata: {
    twitter: optional("OINK_TWITTER_URL", "https://x.com/oink"),
    telegram: optional("OINK_TELEGRAM_URL", "https://t.me/oink"),
    website: optional("OINK_WEBSITE_URL", "https://oink.bot"),
    imageMode: optional("IMAGE_ASSET_MODE", "placeholder"),
    imageLocalPath: optional("IMAGE_ASSET_LOCAL_PATH", ""),
    imageRemoteUrl: optional("IMAGE_ASSET_REMOTE_URL", ""),
    enableSourceMediaHotlink: optionalBool("ENABLE_SOURCE_MEDIA_HOTLINK", false),
    uploadProvider: optional("METADATA_UPLOAD_PROVIDER", "dry_wire"),
    assetBaseUrl: optional("METADATA_ASSET_BASE_URL", "https://assets.oink.bot/dry-wire"),
    jsonBaseUrl: optional("METADATA_JSON_BASE_URL", "https://assets.oink.bot/dry-wire/metadata"),
    downloadRemoteImages: optionalBool("METADATA_DOWNLOAD_REMOTE_IMAGES", true),
    liveStrictMode: optionalBool("LIVE_METADATA_STRICT_MODE", optionalBool("ENABLE_REAL_LAUNCHES", false)),
  },
  providers: {
    tiktok: optionalBool("ENABLE_TIKTOK_PROVIDER", true),
    x: optionalBool("ENABLE_X_PROVIDER", true),
  },
  x: {
    bearerToken: optional("X_BEARER_TOKEN", ""),
    searchQueries: optionalList("X_SEARCH_QUERIES"),
    minShareVelocity: optionalInt("X_MIN_SHARE_VELOCITY", "100"),
    minQuoteVelocity: optionalInt("X_MIN_QUOTE_VELOCITY", "25"),
    minRepostVelocity: optionalInt("X_MIN_REPOST_VELOCITY", "75"),
    minQuoteAcceleration: optionalInt("X_MIN_QUOTE_ACCELERATION", "3"),
    minRepostAcceleration: optionalInt("X_MIN_REPOST_ACCELERATION", "3"),
    minQuoteRate: Number(optional("X_MIN_QUOTE_RATE", "0.35")),
    minQuoteToLikeRate: Number(optional("X_MIN_QUOTE_TO_LIKE_RATE", "0.08")),
    minViewsPerHour: optionalInt("X_MIN_VIEWS_PER_HOUR", "50000"),
    minEngagementPerHour: optionalInt("X_MIN_ENGAGEMENT_PER_HOUR", "250"),
    minEngagementAcceleration: optionalInt("X_MIN_ENGAGEMENT_ACCELERATION", "500"),
    minAttentionShapeScore: optionalInt("X_MIN_ATTENTION_SHAPE_SCORE", "25000"),
    minScoutShapeScore: optionalInt("X_MIN_SCOUT_SHAPE_SCORE", "500"),
    maxScoutPostsPerQuery: optionalInt("X_MAX_SCOUT_POSTS_PER_QUERY", "1"),
    maxPostAgeHours: optionalInt("X_MAX_POST_AGE_HOURS", "12"),
    maxStrongPostAgeHours: optionalInt("X_MAX_STRONG_POST_AGE_HOURS", "48"),
    resultsPerQuery: optionalInt("X_RESULTS_PER_QUERY", "25"),
  },
};
