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

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const WALLET_ROLE_KEYS = [
  ["deploy_wallet", "DEPLOY_WALLET_PUBLIC_KEY"],
  ["treasury_wallet", "TREASURY_WALLET_PUBLIC_KEY"],
  ["fee_wallet", "FEE_WALLET_PUBLIC_KEY"],
  ["monitoring_wallet", "MONITORING_WALLET_PUBLIC_KEY"],
];

export function isValidSolanaPublicKey(value) {
  const key = String(value || "").trim();
  if (!key) return false;
  if (![32, 44].includes(key.length) && (key.length < 32 || key.length > 44)) return false;
  let bytes;
  try {
    bytes = decodeBase58(key);
  } catch {
    return false;
  }
  return bytes.length === 32;
}

function decodeBase58(value) {
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("invalid base58");
    let carry = digit;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return bytes.reverse();
}

function walletPublicKeyDiagnostics(wallets) {
  const duplicates = new Map();
  const diagnostics = WALLET_ROLE_KEYS.map(([role]) => {
    const publicKey = wallets[role];
    const configured = Boolean(publicKey);
    const valid = configured ? isValidSolanaPublicKey(publicKey) : false;
    return { role, publicKey, configured, valid, warnings: [] };
  });

  for (const item of diagnostics) {
    if (!item.configured) continue;
    const key = item.publicKey;
    duplicates.set(key, [...(duplicates.get(key) || []), item.role]);
    if (!item.valid) item.warnings.push("invalid_solana_public_key");
  }

  for (const roles of duplicates.values()) {
    if (roles.length <= 1) continue;
    for (const role of roles) {
      const item = diagnostics.find((entry) => entry.role === role);
      item?.warnings.push(`wallet_reused_across_roles:${roles.join(",")}`);
    }
  }

  return diagnostics;
}

function validateWalletPublicConfig({ enableRealLaunches, wallets }) {
  const diagnostics = walletPublicKeyDiagnostics(wallets);
  const warnings = diagnostics.flatMap((item) => item.warnings.map((warning) => `${item.role}: ${warning}`));

  for (const warning of warnings) {
    console.warn(`⚠️ Wallet config warning: ${warning}`);
  }

  if (!enableRealLaunches) return diagnostics;

  const failures = diagnostics
    .filter((item) => !item.configured || !item.valid || item.warnings.some((warning) => warning.startsWith("wallet_reused")))
    .map((item) => `${item.role}:${!item.configured ? "missing" : item.warnings.join("|") || "invalid"}`);

  if (failures.length) {
    throw new Error(`Wallet configuration invalid for ENABLE_REAL_LAUNCHES=true: ${failures.join(", ")}`);
  }

  return diagnostics;
}

const enableRealLaunches = optionalBool("ENABLE_REAL_LAUNCHES", false);
const walletPublicKeys = {
  deploy_wallet: optional("DEPLOY_WALLET_PUBLIC_KEY", "").trim(),
  treasury_wallet: optional("TREASURY_WALLET_PUBLIC_KEY", "").trim(),
  fee_wallet: optional("FEE_WALLET_PUBLIC_KEY", "").trim(),
  monitoring_wallet: optional("MONITORING_WALLET_PUBLIC_KEY", "").trim(),
};
const walletDiagnostics = validateWalletPublicConfig({ enableRealLaunches, wallets: walletPublicKeys });

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
    enableRealLaunches,
    deploymentMinReadiness: optionalInt("DEPLOYMENT_MIN_LAUNCH_READINESS", "80"),
    deploymentMaxSwarmPressure: optionalInt("DEPLOYMENT_MAX_SWARM_PRESSURE", "40"),
    globalDisable: optionalBool("OINK_GLOBAL_LAUNCH_DISABLE", false),
    maxLaunchesPerHour: optionalInt("MAX_LAUNCHES_PER_HOUR", "3"),
    sameNarrativeWindowHours: optionalInt("SAME_NARRATIVE_SUPPRESSION_HOURS", "24"),
    tickerCooldownHours: optionalInt("TICKER_COLLISION_COOLDOWN_HOURS", "72"),
  },
  pumpPortal: {
    apiBaseUrl: optional("PUMPPORTAL_API_BASE_URL", "https://pumpportal.fun/api"),
    apiKey: optional("PUMPPORTAL_API_KEY", ""),
    createAmount: Number(optional("PUMPPORTAL_CREATE_AMOUNT_SOL", "0.0001")),
    slippage: optionalInt("PUMPPORTAL_SLIPPAGE", "10"),
    priorityFee: Number(optional("PUMPPORTAL_PRIORITY_FEE_SOL", "0.00001")),
    pool: optional("PUMPPORTAL_POOL", "pump"),
  },
  pinata: {
    jwtPresent: Boolean(optional("PINATA_JWT", "").trim()),
    uploadUrl: optional("PINATA_UPLOAD_URL", "https://uploads.pinata.cloud/v3/files"),
  },
  solana: {
    rpcUrl: optional("SOLANA_RPC_URL", ""),
    confirmationTimeoutMs: optionalInt("SOLANA_CONFIRMATION_TIMEOUT_MS", "60000"),
    confirmationPollMs: optionalInt("SOLANA_CONFIRMATION_POLL_MS", "2500"),
  },
  wallets: {
    signerDisabled: optionalBool("SIGNER_DISABLED", true),
    deployPrivateKeyPresent: Boolean(optional("DEPLOY_WALLET_PRIVATE_KEY", "").trim()),
    deployPublicKey: walletPublicKeys.deploy_wallet,
    treasuryPublicKey: walletPublicKeys.treasury_wallet,
    feePublicKey: walletPublicKeys.fee_wallet,
    monitoringPublicKey: walletPublicKeys.monitoring_wallet,
    publicKeyDiagnostics: walletDiagnostics,
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
    assetHostingProvider: optional("ASSET_HOSTING_PROVIDER", "local"),
    hostedAssetBaseUrl: optional("HOSTED_ASSET_BASE_URL", "https://assets.oink.bot/local"),
    assetLocalDir: optional("ASSET_LOCAL_DIR", ".oink-assets"),
    assetUploadRetries: optionalInt("ASSET_UPLOAD_RETRIES", "2"),
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
