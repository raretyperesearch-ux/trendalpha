export function generateLaunchBrief({ trend, trendScore, launchScore, token }) {
  const cleanName = cleanTrendName(trend.name);
  const suggestedName = titleCase(selectStrongName(cleanName));
  const suggestedTicker = buildTicker(suggestedName);
  const sourceUrl = getSourceUrl(trend, cleanName);
  const existingToken = token ? { ...token } : null;

  return {
    sourcePlatform: "tiktok",
    sourceUrl,
    originalTrendName: trend.name,
    suggestedName,
    suggestedTicker,
    thesis: buildThesis({ trend, suggestedName, launchScore, token }),
    description: `${suggestedName} is an OINK attention-market candidate discovered from rising TikTok demand before the market is fully formed.`,
    firstTweet: `OINK spotted ${formatTrendName(trend.name)} moving through TikTok before the market fully caught up. Watching ${suggestedName} as an attention-market candidate. $${suggestedTicker}`,
    telegramSummary: `${suggestedName} is a TikTok attention spike with ${articleFor(launchScore.label)} ${launchScore.label} launch score (${launchScore.total}/100).`,
    imagePrompt: `Clean playful internet-native OINK logo for "${suggestedName}": bold mascot-style mark, simple silhouette, high contrast, readable at small sizes, no text except optional $${suggestedTicker} ticker treatment.`,
    riskFlags: launchScore.riskFlags || [],
    existingToken,
    launchScore,
    trendScore,
  };
}

function getSourceUrl(trend, cleanName) {
  if (trend.type === "hashtag") {
    return `https://www.tiktok.com/tag/${encodeURIComponent(cleanName.replace(/\s+/g, ""))}`;
  }
  return trend.songLink || "https://www.tiktok.com/";
}

function cleanTrendName(name = "") {
  return splitCamelCase(name)
    .replace(/^#+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s*@\w+.*$/, "")
    .replace(/\b(sound|remix|original|trend|challenge|official)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function selectStrongName(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.join("").length <= 18 && words.length <= 3) return name;

  const strongWords = words
    .filter((word) => !/^(the|a|an|and|or|to|for|with|of|in|on|my|your|our|new)$/i.test(word))
    .sort((a, b) => scoreWord(b) - scoreWord(a));

  return (strongWords.slice(0, 2).join(" ") || words.slice(0, 2).join(" ")).trim();
}

function buildTicker(name) {
  const compact = name.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (compact.length <= 10) return compact || "OINK";

  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

  if (initials.length >= 3 && initials.length <= 10) return initials;
  return compact.slice(0, 10);
}

function buildThesis({ trend, suggestedName, launchScore, token }) {
  const direction = trend.trendDirection === "rising" ? "rising" : "active";
  const tokenContext = token
    ? "A related token already exists, so OINK treats this as saturation-aware review rather than a blind launch."
    : "No strong matching token was found, leaving potential white space before a market fully forms.";

  return `${suggestedName} is a ${direction} TikTok attention cluster with ${articleFor(launchScore.label)} ${launchScore.label} launch score. The signal is interesting because OINK is seeing social demand before on-chain liquidity has clearly captured it. ${tokenContext}`;
}

function formatTrendName(name) {
  return name.startsWith("#") ? name : `"${name}"`;
}

function titleCase(text) {
  return splitCamelCase(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function splitCamelCase(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function articleFor(label) {
  return /^[AEIOU]/i.test(label) ? "an" : "a";
}

function scoreWord(word) {
  let score = Math.min(word.length, 10);
  if (/^[a-z0-9]+$/i.test(word)) score += 2;
  if (word.length >= 4 && word.length <= 8) score += 2;
  return score;
}
