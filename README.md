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

**OINK is an autonomous attention-layer engine preparing internet-native narratives for market formation.**

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
- Narrative clusters forming across posts, accounts, phrases, and media motifs
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

OINK optimizes for early market formation, not maximum saturation visibility. A 90+ viral score can mean the internet has already fully discovered the narrative, so OINK now models phase and saturation pressure instead of treating the highest static score as automatically best.

Market formation outputs include:

- **Launch worthiness score**: whether attention is suitable for autonomous market creation.
- **Narrative phase**: `emerging`, `forming`, `accelerating`, `breakout`, `saturated`, `decaying`, `dormant`, or `reigniting`.
- **Launch readiness**: phase-aware readiness that rewards acceleration and penalizes saturation.
- **Launch window**: `TOO_EARLY`, `WATCH`, `FORMING_WINDOW`, `PRIME_WINDOW`, `LATE_STAGE`, or `SATURATED`.
- **Timing diagnostics**: acceleration slope, momentum persistence, quote-chain expansion, propagation half-life, remix growth rate, and cross-community breakout timing.
- **Saturation pressure**: whether visibility, passive engagement, flattening quotes, copycats, or swarm pressure suggest the window is closing.
- **Market archetype**: mascot, phrase, personality, event, aesthetic, identity, movement, reaction, chaos, collectible, anti-meme, or trendwave.
- **Narrative half-life**: flash trend, short-cycle meme, medium-cycle narrative, or persistent identity candidate.
- **Launch recommendation**: `DO_NOT_LAUNCH`, `WATCH`, `PREPARE_LAUNCH`, `HIGH_CONVICTION`, or `BREAKOUT_FORMING`.

The phase zones are intentionally early:

- `75-82`: early formation zone
- `82-90`: high-conviction breakout zone
- `90+`: possible saturation review zone

Copycat swarms lower launch worthiness because polluted narratives are harder to own. Unclaimed attention with rising quote velocity, cross-community spread, and strong identity formation can receive high readiness before it reaches full internet saturation.

Timing states matter because a narrative can be real but not yet ready, or real but already too late. OINK boosts readiness during quote explosion windows, remix expansion windows, acceleration inflection points, and cross-community breakout moments. It penalizes passive engagement, stale persistence, flattening remixability, and rising copycat density.

## Narrative Clusters

OINK no longer treats every viral post as an isolated signal. It builds evolving narrative clusters when related attention events converge around the same entity, phrase, creator, quote chain, visual motif, or recurring framing.

Cluster intelligence tracks:

- Canonical entity and aliases
- Related posts, accounts, and phrases
- Total attention and attention momentum
- Propagation persistence
- Community spread
- Remix count
- Market status
- Copycat swarm pollution

Cluster lifecycle states are mapped into market phases: `emerging`, `forming`, `accelerating`, `breakout`, `saturated`, `decaying`, `dormant`, and `reigniting`.

A cluster is stronger when multiple posts reinforce the same narrative, multiple accounts carry it into different communities, remix count expands, and momentum persists across scans. If a dormant narrative suddenly accelerates again, OINK marks it as `reigniting` and boosts review priority.

## Narrative Memory

OINK persists narrative cluster snapshots in Supabase so it can model lifecycle movement over time instead of only reading a single scan. The `narrative_cluster_snapshots` table stores phase, momentum, propagation shape, launch readiness, persistence, swarm pressure, saturation, remixability, cross-community score, attention totals, and the raw JSON snapshot.

Narrative memory tracks:

- Phase transitions across `emerging`, `forming`, `accelerating`, `breakout`, `saturated`, `decaying`, `dormant`, and `reigniting`
- Acceleration changes and inflection points
- Persistence growth and momentum durability
- Saturation waves and copycat swarm escalation
- Re-emergence events when old narratives become active again
- Decay curves and missed launch windows

If the dedicated memory table is missing or rejects a payload, OINK retries a minimal insert and falls back to the existing `trend_snapshots` table. Scans should continue even when Supabase schema changes are incomplete.

Apply `supabase/migration.sql` in the Supabase SQL editor to create or update the memory table and indexes.

## Launch Flow

```txt
Viral Post
  -> Attention Scanner
  -> Narrative Memory
  -> Launch Timing Engine
  -> PumpPortal Dry Run
  -> Shadow Launch Payload
  -> Launch Review
  -> Fees
  -> $OINK Buybacks
```

For now, OINK only prepares launch candidates. It does not launch tokens.

## PumpPortal Dry Runs

OINK can prepare PumpPortal-style deployment metadata without broadcasting a transaction. A dry-run launch payload includes token name, ticker, description, narrative summary, archetype, launch reasoning, launch confidence, launch timing, image prompt, X draft, Telegram draft, and Pump.fun description draft.

Ticker generation is intentionally conservative. OINK prefers short identity-centric tickers and rejects weak or polluted patterns such as generic meme suffixes, duplicate tickers, and stuffed `AIINU`-style symbols.

Dry-run launch records are stored in `shadow_launches` when the Supabase migration is applied. If that table is missing, OINK falls back to `trend_snapshots` so scans keep running. These records are simulation artifacts only.

## What OINK Produces

OINK turns attention into structured outputs:

- **Trend score**: how strong the underlying attention is.
- **Launch score**: whether the attention could plausibly become a market.
- **Suggested name and ticker**: a clean market framing.
- **Launch thesis**: why the attention matters before a market fully forms.
- **Risk flags**: reasons a candidate may need review or rejection.
- **Shadow launch payloads**: dry-run PumpPortal metadata for high-conviction clusters.
- **Telegram cards**: launch candidate alerts for fast review.
- **Terminal dashboard**: latest scanned trends, launch scores, ticker suggestions, token status, and buyback flywheel.

## Telegram Alerts

OINK sends:

- Standard attention alerts
- Narrative cluster alerts
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

Narrative cluster cards show entity, lifecycle state, momentum, cross-community spread, posts tracked, accounts involved, remix count, launch worthiness, and recommendation.

### Telegram Reliability

Telegram delivery is treated as higher priority than button richness. OINK validates inline keyboard payloads before sending, keeps `callback_data` under Telegram's 64-byte limit, rejects malformed button URLs, and falls back automatically if Telegram rejects a payload.

Alert delivery downgrades in this order:

```txt
rich alert with safe buttons
  -> rich alert without buttons
  -> compact HTML alert
  -> minimal plain-text alert
```

`TELEGRAM_SAFE_MODE=true` disables risky inline buttons and starts alerts in compact mode. This is the recommended production setting while X alert volume is high.

Use:

```bash
npm run test-telegram-alert
```

to validate payload sizes, keyboard structure, URL rejection, and fallback recovery without sending a real Telegram message.

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
npm run test-telegram-alert
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
- Broadcast PumpPortal transactions
- Use funded wallets

The launch adapters prepare metadata only. PumpPortal support is dry-run simulation infrastructure, not a deployment path.

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
