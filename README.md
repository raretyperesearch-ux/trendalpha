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

**OINK is an autonomous attention-layer engine that evaluates whether internet attention can sustain market identity.**

OINK was formerly TrendAlpha. TrendAlpha proved the first idea: internet trends can become market narratives before most people notice them. OINK takes the next step: it watches viral attention across social platforms, scores whether that attention could become a market, generates launch briefs, and prepares candidates for human review.

The goal is not to chase coins that already exist. The goal is to catch the raw attention before the market forms.

OINK is intentionally conservative about existing-token matches. A random copycat token is not treated as the canonical market for a viral post just because one generic word overlaps. Existing markets are attached only when canonical entity confidence is extremely high; weak matches are shown as possible markets without contract addresses, and most raw attention should remain `NO TOKEN FOUND`.

## What OINK Watches

OINK currently watches two types of attention:

- **TikTok trends**: broader trend movement, recurring phrases, hashtags, sounds, and culture loops.
- **X posts**: individual viral posts with unusual velocity, media, reactions, reposts, replies, quotes, and freshness.

TikTok is the trend scanner.

X is the viral post scanner.

Together, they give OINK a better read on what the internet is noticing before traders turn it into a ticker.

## What OINK Looks For

OINK is tuned for raw viral attention, not crypto chatter. It no longer relies on meme keyword search as the core discovery mechanism.

It cares about:

- Propagation and acceleration
- Repost cascades
- Quote-chain behavior
- Attention persistence
- Cross-community spread
- Unusually high engagement relative to account size
- Early marketability emerging from remix structure
- Whether a related token already exists
- Risk flags around brands, celebrities, tragedy, or already-saturated crypto language

If a post is already talking about `pump.fun`, contract addresses, 100x calls, tickers, or memecoins, OINK treats that as a warning sign. That kind of language may mean the attention is already downstream of crypto instead of originating from broader internet culture.

## Market Matching

OINK prioritizes detecting attention before markets exist. Token matching is gated by canonical confidence:

- `CANONICAL MARKET FOUND`: high-confidence entity and phrase overlap with legitimate market data.
- `POSSIBLE MARKET DETECTED`: some overlap exists, but confidence is not high enough to show a contract.
- `NO TOKEN FOUND`: no canonical market, so the post remains an attention-market candidate.

Generic terms like `law`, `cat`, `ai`, `dog`, `base`, `meme`, `coin`, `official`, and `finance` are heavily discounted. Copycat meme tokens and narrative hijacks should not be treated as canonical markets.

## Launch Worthiness

OINK does not assume every viral post deserves a market. It evaluates whether attention can form a durable market identity using narrative clarity, repeatability, remixability, mascot potential, symbolic density, phrase stickiness, identity formation, cross-community persistence, propagation persistence, and meme mutation potential.

Market formation outputs include:

- **Launch worthiness score**: whether attention is suitable for autonomous market creation.
- **Market archetype**: mascot, phrase, personality, event, aesthetic, identity, movement, reaction, chaos, collectible, anti-meme, or trendwave.
- **Narrative half-life**: flash trend, short-cycle meme, medium-cycle narrative, or persistent identity candidate.
- **Launch recommendation**: `DO_NOT_LAUNCH`, `WATCH`, `EARLY_OPPORTUNITY`, `HIGH_CONVICTION`, or `BREAKOUT_FORMING`.

Copycat swarms lower launch worthiness because polluted narratives are harder to own. Unclaimed attention with strong propagation and no canonical market receives a boost.

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

OINK’s X scanner prioritizes propagation dynamics. Views show reach, repost velocity shows distribution, quote velocity shows remix pressure, engagement acceleration shows whether attention is compounding, and attention momentum ties those signals together.

OINK classifies viral shape as `explosive`, `compounding`, `slowburn`, `saturated`, `likely_bot_amplified`, `low_conversion`, or `cross_community`. It also tracks momentum trend from snapshots as `rising`, `stable`, `decaying`, or `reigniting`.

Custom `X_SEARCH_QUERIES` must include at least one real search term. X rejects queries made only from operators such as `has:media lang:en -is:retweet`. Separate multiple queries with `|`. Keep discovery broad; OINK ranks X posts by attention shape rather than crypto or meme keywords.

Example:

```bash
X_SEARCH_QUERIES=(the OR this OR what OR how) has:media lang:en -is:retweet -is:reply|(video OR clip OR photo OR moment) has:media lang:en -is:retweet -is:reply
```

When X impressions are unavailable, OINK still filters candidates with engagement velocity and attention shape score. Tune `X_MIN_ENGAGEMENT_PER_HOUR`, `X_MIN_ENGAGEMENT_ACCELERATION`, quote/repost velocity thresholds, and `X_MIN_ATTENTION_SHAPE_SCORE` if Railway logs show good posts being rejected below thresholds. Strong candidates can stay eligible up to `X_MAX_STRONG_POST_AGE_HOURS`.

If recent search returns only low-metric posts, OINK can keep a tiny scout sample with `X_MIN_SCOUT_SHAPE_SCORE` and `X_MAX_SCOUT_POSTS_PER_QUERY`. Scout posts still go through the normal scoring and alert thresholds, so they help visibility without bypassing Telegram quality controls.

Discovery lanes include `broad_media_stream`, `trusted_viral_accounts`, `emerging_accounts`, and `quote_explosion_watch`. Keywords only lightly bias ranking and improve readability; they do not determine eligibility.

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
