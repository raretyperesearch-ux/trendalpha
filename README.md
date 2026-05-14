# 🐷 OINK

**OINK, formerly TrendAlpha, is a TikTok trend intelligence bot that turns viral internet attention into crypto market signals.**

It scans TikTok Creative Center for rising hashtags, scores each trend based on velocity and momentum, checks whether a related token already exists on-chain, and sends actionable Telegram alerts before the crowd fully catches on.

Think of it as an early-warning radar for meme liquidity. A little pig snout pressed against the glass of internet culture, sniffing for the next thing before it becomes obvious.

---

## Name Change

This project was originally called **TrendAlpha**.

It is now known as **OINK**.

Some code, file names, package names, logs, or repo references may still mention `trendalpha` while the project is being renamed. The product name going forward is **OINK**.

---

## What It Does

OINK watches TikTok for fast-moving cultural signals and turns them into structured crypto research alerts.

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

OINK is designed to catch that window early.

It does not predict price.  
It detects cultural velocity.

---

## Core Features

### 📱 TikTok Trend Scanner

OINK pulls real TikTok Creative Center trend data using RapidAPI.

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

For every high-scoring trend, OINK checks whether a related token already exists.

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

OINK sends formatted alerts directly to a Telegram channel.

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

In addition to live alerts, OINK posts a digest every 3 hours.

The digest summarizes the top trends by score, giving a clean overview of what is currently moving across TikTok.

### 🔁 Re-Alerts on Score Jumps

OINK avoids spamming the same trend repeatedly.

However, if a trend was already alerted and its score jumps meaningfully, the bot can alert again.

Current re-alert threshold:

```js
SCORE_JUMP_THRESHOLD = 10
```

So if a trend goes from 68 to 80, it can fire again.

---

## How It Works

The main production loop lives in `src/index.js`.

On startup, the bot:

1. Initializes Supabase
2. Starts the Telegram bot
3. Runs an immediate scan
4. Schedules future scans
5. Schedules recurring digests

Default scan schedule:

```txt
Every 15 minutes
```

Default digest schedule:

```txt
Every 3 hours
```

---

## Project Structure

```txt
trendalpha/
├── src/
│   ├── index.js          # Main cron loop and production entry point
│   ├── config.js         # Environment variable loader
│   ├── tiktok.js         # TikTok Creative Center trend scanner
│   ├── scoring.js        # Trend scoring engine
│   ├── tokens.js         # DexScreener + Birdeye token matcher
│   ├── telegram.js       # Telegram bot, alerts, digests, refresh button
│   ├── db.js             # Supabase storage and alert history
│   └── scripts/
│       ├── testAlert.js  # Send a test Telegram alert
│       └── runScan.js    # Run one manual scan
├── supabase/
│   └── migration.sql     # Database schema
├── .env.example          # Environment variable template
├── package.json
└── README.md
```

---

## Requirements

- Node.js 18+
- Telegram bot token
- Telegram channel ID
- Supabase project
- RapidAPI key for TikTok Creative Center data
- Optional Birdeye API key

---

## Installation

```bash
git clone https://github.com/raretyperesearch-ux/trendalpha.git
cd trendalpha
npm install
```

---

## Environment Setup

Copy the example env file:

```bash
cp .env.example .env
```

Then add your keys:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=

SUPABASE_URL=
SUPABASE_ANON_KEY=

RAPIDAPI_KEY=
BIRDEYE_API_KEY=

SCAN_INTERVAL_MINUTES=15
MIN_SCORE_TO_ALERT=65
```

---

## Telegram Setup

1. Message [@BotFather](https://t.me/BotFather)
2. Create a new bot with `/newbot`
3. Copy the bot token
4. Create a Telegram channel
5. Add your bot as an admin
6. Get your channel ID
7. Add the ID to `.env`

---

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Open the SQL editor
3. Paste the contents of `supabase/migration.sql`
4. Run the migration
5. Copy your project URL and anon key into `.env`

Supabase is used to store:

- Trend snapshots
- Previous scores
- Alert history
- Recently alerted trends

This allows the bot to compare new scans against old scans.

---

## Running Locally

Send a test alert:

```bash
npm run test-alert
```

Run one scan manually:

```bash
npm run scan
```

Run the production bot:

```bash
npm start
```

Run in development mode:

```bash
npm run dev
```

---

## Deployment

Railway is the simplest deployment option.

1. Push this repo to GitHub
2. Create a new Railway project
3. Deploy from GitHub
4. Add your environment variables
5. Start the service with:

```bash
npm start
```

The bot will stay online and run scans automatically.

---

## Scripts

```json
{
  "start": "node src/index.js",
  "dev": "node --watch src/index.js",
  "scan": "node src/scripts/runScan.js",
  "test-alert": "node src/scripts/testAlert.js"
}
```

---

## Example Alert

```txt
🔴 OINK VIRAL TREND ALERT

🎯 SCORE: 88/100
█████████░

📱 TIKTOK TREND
#exampletrend

📈 Rising | Rank #12

⚡ Views/hour: 420K
👁 Total views: 82M
🎬 Videos made: 18K

✅ TOKEN FOUND
EXAMPLE SOL

💰 MCap: $2.4M
📊 24h Vol: $780K
💧 Liquidity: $120K
📈 24h: +42.6%

CA: xxxxxxxx
```

---

## Important Notes

OINK is not a trading bot.

It does not place trades, custody funds, or guarantee profitable signals.

It is an attention intelligence system that helps surface fast-moving TikTok trends and related tokens.

Use it for research, watchlists, and early discovery.

---

## Roadmap Ideas

- Web dashboard
- Premium Telegram tier
- Discord alerts
- Pump.fun launch monitor
- Better TikTok sound support
- Token launch detection
- Historical trend charts
- Weekly hit-rate reports
- Wallet tracking
- API access

---

## Disclaimer

This project is for informational and research purposes only.

Nothing here is financial advice.  
Memecoins are volatile, illiquid, weird little goblin rockets.  
Do your own research.
