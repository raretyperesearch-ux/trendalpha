# OINK

**OINK, formerly TrendAlpha, is the attention layer for internet-native markets.**

TrendAlpha was phase one: it scanned TikTok Creative Center trends and caught narratives before they had coins. OINK is phase two: it detects viral attention before markets exist, scores launch potential, generates launch briefs, and prepares launch candidates for review.

The scanner is active today, starting with TikTok trends first, then expanding into other attention markets. Real token launching, wallet handling, private-key actions, and transaction submission are not implemented yet.

## Launch Flow

```txt
Viral Post
  -> Attention Scanner
  -> Launch Score Engine
  -> Autonomous Market Prepared
  -> Launch Fees
  -> $OINK Buybacks
```

Launch candidates are prepared only. The pump.fun adapter currently returns metadata and a safety note; it does not call APIs, touch wallets, or submit transactions.

## What The Bot Does

- Scans TikTok Creative Center trends through RapidAPI.
- Filters low-quality noise like generic hashtags, falling trends, and irrelevant categories.
- Scores trend momentum with `src/scoring.js`.
- Checks DexScreener and Birdeye for existing related tokens with `src/tokens.js`.
- Scores launch potential with `src/launchScoring.js`.
- Generates OINK launch briefs with `src/launchBrief.js`.
- Sends Telegram alerts, digests, and launch candidate cards with `src/telegram.js`.
- Stores trend snapshots and alert records in Supabase with `src/db.js`.
- Shows a read-only terminal dashboard with `src/scripts/dashboard.js`.

The repository, package name, and some compatibility references may still say `trendalpha`; user-facing product copy is OINK.

## Quick Start

### 1. Install

```bash
git clone <your-repo>
cd trendalpha
npm install
```

### 2. Set Up Services

**Telegram Bot**

1. Message [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot`, pick a name, and copy the bot token.
3. Create a Telegram channel and add your bot as admin.
4. Get the channel ID by forwarding a channel message to [@userinfobot](https://t.me/userinfobot).

**Supabase**

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL in `supabase/migration.sql`.
3. Copy your project URL and anon key from Settings -> API.

**TikTok Data**

- Subscribe to a TikTok Creative Center API on [RapidAPI](https://rapidapi.com).
- Set `RAPIDAPI_KEY`.

**Birdeye**

- Optional, recommended for Solana token matching.

### 3. Configure

```bash
cp .env.example .env
```

Set your keys, then tune thresholds:

```bash
SCAN_INTERVAL_MINUTES=15
MIN_SCORE_TO_ALERT=70
MIN_LAUNCH_SCORE=82
ENABLE_LAUNCH_CANDIDATES=true
```

### 4. Test

```bash
npm run test-alert
npm run test-launch
npm run dashboard
npm run scan
```

### 5. Run

```bash
npm start
```

## Project Structure

```txt
trendalpha/
├── src/
│   ├── index.js                  # Main cron loop
│   ├── config.js                 # Env var loader
│   ├── tiktok.js                 # TikTok trend scanner
│   ├── scoring.js                # Trend score engine
│   ├── launchScoring.js          # OINK launch score engine
│   ├── launchBrief.js            # Launch brief generation
│   ├── launchers/
│   │   └── pumpfun.js            # Safe launch preparation stub
│   ├── buybacks.js               # OINK fee/buyback model copy
│   ├── tokens.js                 # DexScreener + Birdeye matching
│   ├── telegram.js               # Alerts, digests, candidate cards
│   ├── db.js                     # Supabase storage
│   └── scripts/
│       ├── dashboard.js
│       ├── runScan.js
│       ├── testAlert.js
│       └── testLaunchBrief.js
├── supabase/
│   └── migration.sql
├── .env.example
└── package.json
```

## Trend Scoring

Each trend receives a score from 0 to 100 based on:

| Metric | Weight | What It Means |
|--------|--------|---------------|
| Views per hour | 30 pts | How fast the trend is spreading |
| Video count | 30 pts | How many creators are participating |
| Trend acceleration | 20 pts | Whether the trend is speeding up |
| Rank momentum | 20 pts | Whether it is climbing or newly entering the top 100 |

Conviction levels:

| Score | Label |
|-------|-------|
| 85+ | EXTREME |
| 75-84 | HIGH |
| 65-74 | MEDIUM |
| 55-64 | LOW |
| Below 55 | NOISE |

## Launch Scoring

Launch opportunity scores are 0-100:

| Metric | Max |
|--------|-----|
| Attention velocity | 25 |
| Freshness | 20 |
| Meme clarity | 15 |
| Ticker strength | 15 |
| Visual strength | 10 |
| Saturation | 10 |
| Risk | 5 |

Labels:

- **EXTREME**: 85+
- **HIGH**: 75+
- **MEDIUM**: 65+
- **LOW**: 55+
- **REJECT**: below 55

Existing tokens reduce saturation score when volume or liquidity suggests the market may already exist. No matching token increases saturation score because there may still be white space for a new market.

## Telegram Alerts

OINK sends formatted Telegram messages for:

- Standard attention alerts.
- Top-trend digests every 3 hours.
- Launch candidate cards when a trend clears the launch score threshold.

Launch candidate cards include source link, launch score, conviction, reasons, suggested market name and ticker, launch thesis, risk flags, existing token context, status, and the buyback flywheel.

## Terminal Dashboard

Run:

```bash
npm run dashboard
```

The dashboard reads latest trend snapshots and alert/token metadata from Supabase when available. If the existing tables are empty or unreachable, it renders a small static mock dashboard so the view can still be tested locally.

It displays latest scanned trends, launch score, suggested ticker, token existence, launch candidate status, and the $OINK buyback flywheel. It is read-only and does not launch tokens.

## Safety Boundary

OINK currently prepares launch candidates only. It does not:

- Store or request private keys.
- Connect wallets.
- Submit transactions.
- Call pump.fun or launch-platform APIs.
- Execute autonomous launches.

## Next

- Add more attention sources beyond TikTok.
- Track launch candidate outcomes.
- Add richer risk review and IP filtering.
- Expand the launch adapter once transaction safety, approvals, and custody design are explicit.

**Not financial advice. DYOR.**
