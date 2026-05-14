# 📡 TrendAlpha

**TrendAlpha is a TikTok trend intelligence bot that turns viral internet attention into crypto market signals.**

It scans TikTok Creative Center for rising hashtags, scores each trend based on velocity and momentum, checks whether a related token already exists on-chain, and sends actionable Telegram alerts before the crowd fully catches on.

Think of it as an early-warning radar for meme liquidity.

---

## What It Does

TrendAlpha watches TikTok for fast-moving cultural signals and turns them into structured alerts.

Every scan, it:

1. Pulls trending TikTok hashtags from TikTok Creative Center
2. Filters out low-quality noise like generic hashtags, spam trends, falling trends, and irrelevant categories
3. Scores each trend from 0 to 100 using attention velocity, video count, acceleration, and rank momentum
4. Searches DexScreener and Birdeye to see if a matching token already exists
5. Sends high-conviction alerts to Telegram
6. Posts a digest of top trends every 3 hours
7. Stores trend snapshots in Supabase so it can detect score jumps over time

---

## Why This Exists

Memecoins are downstream of attention.

A TikTok sound, hashtag, phrase, animal, joke, or weird internet moment can become a token before most traders even know the trend exists.

TrendAlpha is designed to catch that window early.

It does not predict price.  
It detects cultural velocity.

---

## Core Features

### 📱 TikTok Trend Scanner

TrendAlpha pulls real TikTok Creative Center trend data using RapidAPI.

It currently scans the top 100 trending hashtags in the US market, including:

- Hashtag name
- Total views
- Video count
- Current rank
- Rank movement
- 7-day trend curve
- Trend direction
- Acceleration

The scanner fetches multiple pages of trending hashtags and sorts them by rising momentum and total attention.

### 🎯 Trend Scoring Engine

Each trend receives a score from 0 to 100.

The score is based on:

| Metric | Weight | What It Means |
|--------|--------|---------------|
| Views per hour | 30 pts | How fast the trend is spreading |
| Video count | 30 pts | How many creators are participating |
| Trend acceleration | 20 pts | Whether the trend is speeding up |
| Rank momentum | 20 pts | Whether it is climbing or newly entering the top 100 |

Conviction levels:

| Score | Label |
|-------|-------|
| 85+ | 🔴 EXTREME |
| 75-84 | 🟠 HIGH |
| 65-74 | 🟡 MEDIUM |
| 55-64 | ⚪ LOW |
| Below 55 | 💤 NOISE |

### 🧹 Noise Filtering

The bot filters out obvious junk before scoring.

It skips things like:

- Generic hashtags: `#fyp`, `#viral`, `#trending`, `#foryou`
- Overly broad categories
- Falling trends
- Very long hashtag names
- Certain non-English or irrelevant trend patterns
- Generic trading/investing tags that do not represent fresh culture

This keeps alerts focused on things that may actually become memeable.

### 🔍 Token Matching

For every high-scoring trend, TrendAlpha checks whether a related token already exists.

It searches:

- **DexScreener** for multi-chain token matches
- **Birdeye** for Solana token matches

When a token is found, the alert includes:

- Token symbol
- Chain
- Contract address
- Market cap
- 24h volume
- Liquidity
- 24h price change
- Trading links

If no token exists yet, the alert marks it as a potential watchlist item.

### 📤 Telegram Alerts

TrendAlpha sends formatted alerts directly to a Telegram channel.

Alerts include:

- Trend name
- Score
- Conviction level
- TikTok link
- Views per hour
- Total views
- Video count
- Rank
- Trend direction
- Token data, if found
- Refresh button for updating the trend in place

### 📊 Trend Digest

In addition to live alerts, TrendAlpha posts a digest every 3 hours.

The digest summarizes the top trends by score, giving a clean overview of what is currently moving across TikTok.

### 🔁 Re-Alerts on Score Jumps

TrendAlpha avoids spamming the same trend repeatedly.

However, if a trend was already alerted and its score jumps meaningfully, the bot can alert again.

Current re-alert threshold:

```js
SCORE_JUMP_THRESHOLD = 10
