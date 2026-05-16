# OINK

```txt
        _   _
       (o) (o)
    /     V     \
   /  \       /  \
  /____\_____/____\
       /  |  \
      /___|___\
        OINK
```

**OINK is the attention layer for internet-native markets.**

OINK was formerly TrendAlpha. TrendAlpha proved the first idea: internet trends can become market narratives before most people notice them. OINK takes the next step: it watches viral attention across social platforms, scores whether that attention could become a market, generates launch briefs, and prepares candidates for human review.

The goal is not to chase coins that already exist. The goal is to catch the raw attention before the market forms.

## What OINK Watches

OINK currently watches two types of attention:

- **TikTok trends**: broader trend movement, recurring phrases, hashtags, sounds, and culture loops.
- **X posts**: individual viral posts with unusual velocity, media, reactions, reposts, replies, quotes, and freshness.

TikTok is the trend scanner.

X is the viral post scanner.

Together, they give OINK a better read on what the internet is noticing before traders turn it into a ticker.

## What OINK Looks For

OINK is tuned for raw viral attention, not crypto chatter.

It cares about:

- Fast view and engagement velocity
- Fresh posts and trends
- Meme clarity
- Simple names that can become clean tickers
- Strong visual hooks
- Whether a related token already exists
- Risk flags around brands, celebrities, tragedy, or already-saturated crypto language

If a post is already talking about `pump.fun`, contract addresses, 100x calls, tickers, or memecoins, OINK treats that as a warning sign. That kind of language may mean the attention is already downstream of crypto instead of originating from broader internet culture.

## Launch Flow

```txt
Viral Post
  -> Attention Scanner
  -> Launch Score Engine
  -> Launch Brief
  -> Autonomous Market Prepared
  -> Launch Review
  -> Fees
  -> $OINK Buybacks
```

For now, OINK only prepares launch candidates. It does not launch tokens.

## What OINK Produces

OINK turns attention into structured outputs:

- **Trend score**: how strong the underlying attention is.
- **Launch score**: whether the attention could plausibly become a market.
- **Suggested name and ticker**: a clean market framing.
- **Launch thesis**: why the attention matters before a market fully forms.
- **Risk flags**: reasons a candidate may need review or rejection.
- **Telegram cards**: launch candidate alerts for fast review.
- **Terminal dashboard**: latest scanned trends, launch scores, ticker suggestions, token status, and buyback flywheel.

## Telegram Alerts

OINK sends:

- Standard attention alerts
- Launch candidate cards
- Periodic trend digests

Launch candidate cards include the source, score, conviction, reasons, suggested ticker, launch thesis, existing-token context, risk flags, and status.

### X Virality Metrics

OINK’s X scanner prioritizes views and shares because reposts and quote tweets show distribution and meme remix potential. Views show reach, reposts show spread, quotes show remix pressure, and velocity shows whether the post is moving now.

Custom `X_SEARCH_QUERIES` must include at least one real search term. X rejects queries made only from operators such as `has:media lang:en -is:retweet`. Separate multiple queries with `|`.

Example:

```bash
X_SEARCH_QUERIES=(no way OR insane OR wild) has:media lang:en -is:retweet -is:reply|(dog OR cat OR robot) has:media lang:en -is:retweet -is:reply
```

### X Narrative Tags

For X-sourced launch candidates, OINK generates a hashtag that ties the launch back to the original viral tweet. The tag gives Telegram users a clean phrase to copy, share, and point back at the attention source.

### Telegram Alerts

Telegram is the first OINK terminal. X candidates, TikTok trends, launch candidates, and future market-created alerts are formatted for Telegram-first consumption.

## Dashboard

Run:

```bash
npm run dashboard
```

The dashboard is read-only. It shows recent attention candidates and the $OINK buyback flywheel.

## Local Commands

```bash
npm run scan
npm run scan:dry
npm run test-launch
npm run test-launch-created
npm run test-x
npm run dashboard
npm start
```

## Safety Boundary

OINK currently prepares candidates only.

It does not:

- Store or request private keys
- Connect wallets
- Submit transactions
- Launch tokens
- Execute autonomous trading

The launch adapter is a stub that prepares metadata only.

## Current Direction

OINK is evolving toward autonomous attention markets, but the foundation comes first:

1. Scanner
2. Launch score
3. Launch brief
4. Telegram card
5. Prepared launch metadata
6. Human review

Real autonomous launching comes later, after safety, approvals, custody, and execution rules are explicit.

**Not financial advice. DYOR.**
