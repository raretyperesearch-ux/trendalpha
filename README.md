# 📡 TrendAlpha

**TikTok Trend → Crypto Signal Pipeline for Telegram**

Scans TikTok every 15 minutes for viral trends, scores them on two metrics (views/hour + video count), checks if a token already exists on-chain, and blasts alerts to your Telegram channel.

---

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo>
cd trendalpha
npm install
```

### 2. Set Up Services (all free tier)

**Telegram Bot:**
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, pick a name
3. Copy the bot token
4. Create a Telegram channel, add your bot as **admin**
5. Get the channel ID: forward a message from the channel to [@userinfobot](https://t.me/userinfobot)

**Supabase:**
1. Create a free project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → paste the contents of `supabase/migration.sql` → Run
3. Copy your project URL and anon key from Settings → API

**Birdeye (optional but recommended):**
1. Get a free API key at [birdeye.so](https://birdeye.so)

**TikTok Data (choose one):**
- **RapidAPI** — Subscribe to a TikTok scraping API on [rapidapi.com](https://rapidapi.com), set `RAPIDAPI_KEY`
- **Custom scraper** — Set up your own and point `TIKTOK_SCRAPER_URL` to it
- **No key** — Runs with mock data for development

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your keys
```

### 4. Test

```bash
# Send test alerts to your TG channel
npm run test-alert

# Run a single scan
npm run scan
```

### 5. Deploy

```bash
# Start the bot (scans every 15 min)
npm start
```

---

## Deploy to Railway (recommended)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add your environment variables in the Railway dashboard
4. It auto-deploys and runs 24/7
5. Cost: ~$5/month on Railway

---

## Project Structure

```
trendalpha/
├── src/
│   ├── index.js          # Main entry — cron loop
│   ├── config.js          # Env var loader
│   ├── tiktok.js          # TikTok trend scanner (pluggable providers)
│   ├── scoring.js         # Scoring engine (views/hr + video count)
│   ├── tokens.js          # DexScreener + Birdeye token matching
│   ├── telegram.js        # Alert formatting + TG bot
│   ├── db.js              # Supabase storage
│   └── scripts/
│       ├── testAlert.js   # Send test alerts
│       └── runScan.js     # Run single scan
├── supabase/
│   └── migration.sql      # Database tables
├── .env.example           # Env template
└── package.json
```

---

## How Scoring Works

Two metrics that matter (your friend was right):

| Metric | What it measures | Max points |
|--------|-----------------|------------|
| **Views/hour** | How fast the trend is blowing up | 40 pts |
| **Video count** | How many creators jumped on it | 40 pts |
| **Freshness** | Newer trends = more opportunity | 10 pts |
| **Acceleration** | Is it speeding up or slowing down? | 10 pts |

Score thresholds:
- **90-100** 🔴 EXTREME — drop everything
- **80-89** 🟠 HIGH — strong signal
- **70-79** 🟡 MEDIUM — worth watching
- **60-69** ⚪ LOW — on the radar
- **Below 60** — filtered out (not sent)

---

## TikTok Data Providers

The bot is built with a **provider pattern** — swap in whichever TikTok data source works best:

| Provider | Cost | Reliability | Setup |
|----------|------|-------------|-------|
| RapidAPI TikTok APIs | ~$10-30/mo | Good | Set `RAPIDAPI_KEY` |
| TokAPI | ~$30/mo | Best | Swap in `tiktok.js` |
| Custom Puppeteer scraper | Free (+ hosting) | Variable | Set `TIKTOK_SCRAPER_URL` |
| TikTok Research API | Free | Official | Apply at TikTok |
| Mock data | Free | For dev only | Default fallback |

---

## Customization

**Change scan frequency:**
```
SCAN_INTERVAL_MINUTES=10  # scan every 10 min instead of 15
```

**Change alert threshold:**
```
MIN_SCORE_TO_ALERT=70  # only send score 70+ alerts
```

**Add your own scoring logic:**
Edit `src/scoring.js` — the thresholds and point allocations are all configurable.

---

## What's Next (if it works)

- [ ] Payment gate for premium tier (Stripe or crypto)
- [ ] Hit rate tracking + weekly report
- [ ] Web dashboard with trend history
- [ ] API access for whale tier
- [ ] Discord integration
- [ ] Push notifications

---

**Not financial advice. DYOR. Ship it.** 🚀
