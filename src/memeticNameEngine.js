const WEAK_WORDS = new Set([
  "the", "this", "that", "viral", "meme", "coin", "token", "pump", "fun",
  "official", "real", "new", "launch", "trend", "post", "video", "clip",
  "went", "goes", "going", "says", "said", "watch", "caught", "camera",
]);

const GENERIC_TICKERS = new Set(["AI", "INU", "COIN", "PUMP", "MOON", "BASE", "SOL", "MEME", "VIRAL", "TREND"]);
const POLLUTED_SUFFIXES = /(AIINU|INU|COIN|TOKEN|PUMP|100X)$/i;

export function generateMemeticNameCandidates(cluster = {}, { existingTickers = [] } = {}) {
  const existing = new Set(existingTickers.map(normalizeTicker));
  const artifact = cluster.memeticArtifact || {};
  const seeds = [
    artifact.tokenIdentity,
    cluster.extractedPhrase,
    artifact.extractedPhrase,
    cluster.canonicalEntity,
    ...(cluster.relatedPhrases || []),
    artifact.emotionalTexture,
    cluster.emotionalTexture,
  ].filter(Boolean);

  const candidates = new Map();
  for (const seed of seeds) {
    for (const name of buildNameVariants(seed)) {
      for (const ticker of buildTickerVariants(name)) {
        const candidate = scoreNameCandidate({ name, ticker, cluster, existing });
        const key = `${candidate.name}:${candidate.ticker}`;
        const current = candidates.get(key);
        if (!current || candidate.totalScore > current.totalScore) candidates.set(key, candidate);
      }
    }
  }

  if (candidates.size === 0) {
    const fallback = scoreNameCandidate({ name: "OINK Signal", ticker: "OINK", cluster, existing });
    candidates.set(`${fallback.name}:${fallback.ticker}`, fallback);
  }

  return [...candidates.values()]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10);
}

export function selectMemeticIdentity(cluster = {}, options = {}) {
  const candidates = generateMemeticNameCandidates(cluster, options);
  const selected = candidates.find((candidate) =>
    candidate.tickerQualityScore >= 75 &&
    candidate.namingQualityScore >= 75 &&
    candidate.identityCohesionScore >= 75
  ) || candidates[0];

  const ready = Boolean(
    selected &&
    selected.tickerQualityScore >= 75 &&
    selected.namingQualityScore >= 75 &&
    selected.identityCohesionScore >= 75
  );

  return {
    ready,
    blockReason: ready ? "" : "identity_quality_below_threshold",
    selected,
    candidates,
    thresholds: {
      tickerQualityScore: 75,
      namingQualityScore: 75,
      identityCohesionScore: 75,
    },
  };
}

function scoreNameCandidate({ name, ticker, cluster, existing }) {
  const words = cleanWords(name);
  const normalizedTicker = normalizeTicker(ticker);
  const identityBase = Number(cluster.identityFormationScore || cluster.identityStrength || cluster.launchReadiness || 0);
  const artifactStrength = Number(cluster.artifactStrength || cluster.memeticArtifact?.artifactStrength || 0);
  const phrase = String(cluster.extractedPhrase || cluster.memeticArtifact?.extractedPhrase || cluster.canonicalEntity || "").toLowerCase();
  const phraseWords = cleanWords(phrase);
  const lowerName = name.toLowerCase();

  const phoneticScore = scorePhonetics(name, normalizedTicker);
  const memeScore = clampScore(
    48 +
    (name.length <= 16 ? 14 : 0) +
    (words.length <= 2 ? 10 : 0) +
    (/(dog|cat|ghost|frog|rat|goat|banana|alien|robot|baby|wizard|stare|spin|bonk|honk|yap)/i.test(name) ? 12 : 0) +
    (/(absurd|joy|chaos|awe|cute|weird|panic|funny)/i.test(cluster.emotionalTexture || cluster.memeticArtifact?.emotionalTexture || "") ? 8 : 0) +
    artifactStrength * 0.12
  );
  const uniquenessScore = clampScore(
    88 -
    (existing.has(normalizedTicker) ? 45 : 0) -
    (phraseWords.length >= 2 && words.length === 1 && phraseWords.includes(words[0]?.toLowerCase()) ? 18 : 0) -
    (GENERIC_TICKERS.has(normalizedTicker) ? 30 : 0) -
    (words.some((word) => WEAK_WORDS.has(word.toLowerCase())) ? 12 : 0)
  );
  const literalnessPenalty = clampScore(
    (lowerName === phrase ? 12 : 0) +
    (phraseWords.length >= 2 && words.length === 1 && phraseWords.includes(words[0]?.toLowerCase()) ? 20 : 0) +
    (lowerName.length > 26 ? 18 : 0) +
    (words.length > 3 ? 16 : 0)
  );
  const spamPenalty = clampScore(
    (POLLUTED_SUFFIXES.test(normalizedTicker) ? 35 : 0) +
    (/AI|INU|PUMP|COIN|TOKEN/.test(normalizedTicker) ? 24 : 0) +
    (/([A-Z0-9])\1{3,}/.test(normalizedTicker) ? 20 : 0)
  );
  const tickerQualityScore = clampScore(
    44 +
    (normalizedTicker.length >= 3 && normalizedTicker.length <= 7 ? 22 : 0) +
    (/^[A-Z0-9]+$/.test(normalizedTicker) ? 16 : 0) +
    phoneticScore * 0.18 -
    spamPenalty -
    (existing.has(normalizedTicker) ? 35 : 0)
  );
  const namingQualityScore = clampScore(
    phoneticScore * 0.3 +
    memeScore * 0.34 +
    uniquenessScore * 0.24 -
    literalnessPenalty * 0.35 -
    spamPenalty * 0.25 +
    12
  );
  const identityCohesionScore = clampScore(
    identityBase * 0.48 +
    artifactStrength * 0.28 +
    memeScore * 0.16 +
    (cluster.sourceArtifactType || cluster.memeticArtifact?.artifactType ? 8 : 0)
  );
  const totalScore = clampScore(
    tickerQualityScore * 0.32 +
    namingQualityScore * 0.34 +
    identityCohesionScore * 0.34
  );

  return {
    name: titleCase(name).slice(0, 32),
    ticker: normalizedTicker,
    reason: buildReason({ name, ticker: normalizedTicker, phoneticScore, memeScore, uniquenessScore }),
    phoneticScore,
    memeScore,
    uniquenessScore,
    literalnessPenalty,
    spamPenalty,
    tickerQualityScore,
    namingQualityScore,
    identityCohesionScore,
    totalScore,
  };
}

function buildNameVariants(seed) {
  const words = cleanWords(seed).slice(0, 4);
  if (!words.length) return [];
  const variants = new Set();
  variants.add(words.slice(0, 2).join(" "));
  variants.add(words[0]);
  if (words.length >= 2) {
    variants.add(`${words[0]}${words[1]}`);
    variants.add(`${words[0].slice(0, 4)}${words[1]}`);
    variants.add(`${words[0]} ${words[1]}`);
  }
  if (words.length >= 3) variants.add(`${words[0]} ${words[2]}`);
  return [...variants].filter((name) => name.length >= 3);
}

function buildTickerVariants(name) {
  const words = cleanWords(name);
  const joined = normalizeTicker(words.join(""));
  const first = normalizeTicker(words[0] || "");
  const second = normalizeTicker(words[1] || "");
  const variants = new Set();
  if (joined) variants.add(joined);
  if (first && second) {
    variants.add(`${first.slice(0, 3)}${second.slice(0, 4)}`);
    variants.add(`${first.slice(0, 2)}${second.slice(0, 4)}`);
    variants.add(`${first[0]}${second}`);
  }
  if (first.length >= 3) variants.add(first);
  return [...variants].map((ticker) => normalizeTicker(ticker)).filter((ticker) => ticker.length >= 3);
}

function scorePhonetics(name, ticker) {
  const lower = String(name || "").toLowerCase();
  const vowels = (lower.match(/[aeiou]/g) || []).length;
  const consonants = (lower.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length;
  const vowelRatio = vowels / Math.max(1, vowels + consonants);
  return clampScore(
    45 +
    (name.length >= 4 && name.length <= 16 ? 18 : 0) +
    (ticker.length >= 3 && ticker.length <= 7 ? 14 : 0) +
    (vowelRatio >= 0.25 && vowelRatio <= 0.55 ? 14 : 0) +
    (/([a-z]{2,})\1/i.test(lower) ? 4 : 0)
  );
}

function buildReason({ name, ticker, phoneticScore, memeScore, uniquenessScore }) {
  const bits = [];
  if (phoneticScore >= 75) bits.push("easy to say");
  if (memeScore >= 75) bits.push("meme-compressed");
  if (uniquenessScore >= 75) bits.push("clean ticker space");
  if (name.length <= 16) bits.push("screenshot-friendly");
  return bits.length ? bits.join(", ") : `review candidate for $${ticker}`;
}

function cleanWords(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1)
    .filter((word) => !WEAK_WORDS.has(word.toLowerCase()));
}

function normalizeTicker(value = "") {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
}

function titleCase(text = "") {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}
