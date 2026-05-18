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

**OINK is an autonomous narrative intelligence engine preparing internet-native market deployment.**

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
- Memetic artifacts that can compress into identity, ticker, visual direction, and launch framing
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

## Cross-Platform Artifact Engine

OINK extracts internet-native identity artifacts from X and TikTok before a market forms.

For X, it watches quote chains, screenshots, symbolic images, repeated discourse fragments, recurring phrases, and cross-community propagation.

For TikTok, it compresses captions, repeated phrases, sound titles, stitched formats, reaction formats, freeze-frame moments, emotional expressions, and edit patterns.

Artifacts are scored for recognizability, remixability, screenshot survivability, emotional compression, visual uniqueness, repeatability, and sound stickiness. OINK then compresses artifact + phrase + emotion + visual texture into ticker bias, token identity, launch framing, visual reuse mode, and dry-run launch metadata.

Visual handling is conservative: reuse or crop source media when the artifact is already recognizable, isolate symbols or mascots when they carry the identity, overlay text when the phrase is the artifact, and generate new imagery only when necessary.

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

OINK can prepare PumpPortal-style deployment metadata without broadcasting a transaction. A dry-run launch payload includes token name, ticker, description, narrative summary, archetype, launch reasoning, launch confidence, launch timing, source platform, source artifact type, artifact strength, visual reuse mode, extracted phrase, emotional texture, identity compression summary, image prompt, X draft, Telegram draft, and Pump.fun description draft.

Ticker generation is intentionally conservative. OINK prefers short identity-centric tickers and rejects weak or polluted patterns such as generic meme suffixes, duplicate tickers, and stuffed `AIINU`-style symbols.

The final naming pass uses a Memetic Name Engine. Each dry-run launch gets multiple name/ticker candidates scored for phonetics, meme compression, uniqueness, literalness, spam risk, ticker quality, naming quality, and identity cohesion. Launch prep is blocked with `identity_quality_below_threshold` if the selected identity does not clear OINK's final quality gates.

Dry-run launch records are stored in `shadow_launches` when the Supabase migration is applied. If that table is missing, OINK falls back to `trend_snapshots` so scans keep running. These records are simulation artifacts only.

## PumpPortal Deployment Skeleton

OINK includes a provider-adapter deployment layer for deployment preparation, not live execution. PumpPortal is the first adapter. With `ENABLE_REAL_LAUNCHES=false`, the adapter runs in dry-wire mode: it builds exact deployment payload shapes, prepares metadata, reserves image-upload placeholders, creates unsigned transaction placeholders, validates expected response fields, logs deployment audit events, persists `deployment_attempts`, and stops before broadcast.

The generic `LaunchAdapter` contract separates OINK intelligence from provider transport details. Adapters expose `prepareMetadata`, `uploadAssets`, `buildDeploymentPayload`, `validatePayload`, `prepareTransaction`, `parseResponse`, and `classifyFailure`. PumpPortal also reports capabilities, provider version, payload schema version, endpoint assumptions, and compatibility warnings so future API changes fail gracefully instead of crashing scans.

Deployment validation checks ticker length and format, metadata completeness, duplicate tickers, image prompt presence, launch readiness, and swarm pressure. Telegram diagnostics can show `OINK DEPLOYMENT READY` when a payload is valid, connected, and ready for review.

Real launches remain disabled. OINK does not use funded wallets, private keys, signatures, transaction submission, or PumpPortal broadcast calls.

## Metadata + Image Pipeline

OINK does not treat images as decoration. Launch images are part of memetic identity formation: the image has to preserve the artifact, read at thumbnail size, survive screenshots, and invite remix.

The metadata pipeline turns OINK identity output into PumpPortal-ready fields: `name`, `symbol`, `description`, `image`, `twitter`, `telegram`, `website`, `narrativeSummary`, `sourceBacklink`, `identityArchetype`, and `sloganFragments`.

The image pipeline supports placeholder mode, local generated asset paths, remote HTTPS image URLs, and a future AI-image hook. It scores silhouette clarity, meme readability, screenshot survivability, remixability, narrative alignment, emotional texture, and thumbnail strength.

## Source Media Extraction

OINK uses a source-first image strategy. Native viral artifacts often carry the original memetic context better than generic generated art, so the image pipeline now prefers:

1. Original post media from the viral source
2. Source video thumbnails or preview images
3. Remixed/generated imagery from the source prompt
4. Fully generated fallback imagery
5. Placeholder assets only in dry-wire review mode

For X posts, OINK can extract photo media plus video or animated GIF preview thumbnails when the X API returns media expansions. For TikTok, OINK is ready to use cover images or thumbnails when the provider supplies them; video URLs are stored as references, not launch images.

Source media is validated before use. OINK rejects missing or non-HTTPS URLs, tiny assets, likely profile images, unsupported file types, and dimensions unsuitable for launch metadata. Dry-wire mode can store source URLs for review, but live hotlinking stays disabled unless `ENABLE_SOURCE_MEDIA_HOTLINK=true`.

Before PumpPortal metadata is considered hosted-ready, OINK prepares a rehosted image asset. In dry-wire mode this means downloading or simulating the selected image, fingerprinting it, reviewing MIME type, byte size, dimensions, aspect ratio, and quality, then building final token metadata JSON that points at an OINK-hosted HTTPS asset URL. Source X/TikTok URLs stay as attribution fields; they are not used as final live image URLs.

The hosted asset pipeline supports local storage, temporary CDN preparation, future IPFS, and future PumpPortal-native upload adapters. It creates a metadata-safe PNG, a square launch image, and a resized thumbnail, then freezes an immutable deployment package with hosted image URL, thumbnail URL, metadata URL, content hash, MIME, dimensions, upload provider, upload status, and artifact scores.

When `ENABLE_REAL_LAUNCHES=true`, `LIVE_METADATA_STRICT_MODE` defaults on. Strict mode rejects synthetic dry-wire downloads, requires an actual downloaded/rehosted source or generated image, and requires a real upload target such as Pinata/IPFS, Arweave, or a PumpPortal upload endpoint before metadata can be considered live-eligible. The current provider classes are interfaces only; no real upload credentials, wallets, or broadcasts are enabled.

Placeholder and unresolved AI-hook images can remain in draft review, but they cannot become metadata-ready. Generic, corporate, overly realistic, unrelated, or weak-silhouette prompts are rejected before deployment readiness.

When live providers are unavailable, `MEMORY_ONLY_LAUNCH_TEST_MODE=true` lets OINK load recent high-quality `narrative_cluster_snapshots`, generate dry-run PumpPortal payloads, persist them to `shadow_launches`, and send `OINK PREPARE LAUNCH` Telegram alerts. It only uses stored narrative memory and never broadcasts a launch.

Use:

```bash
npm run test-shadow-launches
```

to exercise shadow launches from memory. By default the test prints and saves dry-run payloads; set `SEND_TELEGRAM=true` or enable `MEMORY_ONLY_LAUNCH_TEST_MODE=true` to send Telegram dry-run alerts.

## What OINK Produces

OINK turns attention into structured outputs:

- **Trend score**: how strong the underlying attention is.
- **Launch score**: whether the attention could plausibly become a market.
- **Memetic artifact score**: whether the source image, phrase, sound, reaction frame, mascot, symbol, or behavior can survive as market identity.
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

## Mission Control

OINK Mission Control is a read-only HTML dashboard for reviewing active clusters, launch readiness, shadow launches, deployment states, identity/image previews, ticker quality, saturation warnings, provider health, deployment queues, audit timelines, and failure diagnostics before wallets or broadcasts exist.

Mission Control also surfaces the human observation queue for dry-run launches. Reviewers can inspect which candidates were queued, approved, rejected, expired, and whether they would launch again after calibration.

Run:

```bash
npm run mission-control
```

It writes `mission-control.html` locally. The page does not execute launches, connect wallets, submit transactions, or broadcast anything.

## Dry-Wire Readiness

OINK now simulates the full launch path before real keys or broadcasts exist. The transaction simulation engine exercises metadata upload, deployment payload construction, transaction assembly, signer flow, confirmation polling, failure handling, and replay logs in dry-wire mode.

Wallet isolation is modeled with strict roles:

- `deploy_wallet`
- `treasury_wallet`
- `fee_wallet`
- `monitoring_wallet`

These are capability boundaries only. OINK uses env-based key stubs for architecture tests, keeps `SIGNER_DISABLED=true` by default, and does not load funded private keys.

Public wallet addresses can be configured for diagnostics with `DEPLOY_WALLET_PUBLIC_KEY`, `TREASURY_WALLET_PUBLIC_KEY`, `FEE_WALLET_PUBLIC_KEY`, and `MONITORING_WALLET_PUBLIC_KEY`. OINK validates Solana public key format, warns when the same address is reused across roles, and only hard-fails wallet config when real launches are explicitly enabled.

`DEPLOY_WALLET_PRIVATE_KEY` is optional and must only be configured in secured Railway env storage when live signing is intentionally tested later. It accepts a Solana 64-byte secret key as either a JSON byte array or base58 string. OINK never prints, logs, persists, or exposes the secret; diagnostics only report whether a key is present, whether the derived public key matches, and whether the hard safety gates are closed.

Live deploy signing is refused unless all gates are open: `ENABLE_REAL_LAUNCHES=true`, `SIGNER_DISABLED=false`, `DEPLOY_WALLET_PRIVATE_KEY` exists, the derived public key matches `DEPLOY_WALLET_PUBLIC_KEY`, wallet role config is valid, and the signing role is `deploy_wallet`.

The observation queue keeps dry-run launches reviewable before autonomy. Candidates can be queued, approved, rejected, expired, voted on for launch quality, and marked with `would_launch_again` calibration data.

## Local Commands

```bash
npm run scan
npm run scan:dry
npm run test-launch
npm run test-launch-created
npm run test-launch-adapter
npm run test-hosted-assets
npm run test-metadata
npm run test-image-pipeline
npm run test-pumpportal
npm run test-pumpportal-metadata
npm run test-live-metadata-rules
npm run test-source-media
npm run test-telegram-alert
npm run test-shadow-launches
npm run test-transaction-sim
npm run test-wallet-architecture
npm run test-wallet-config
npm run test-private-signer-safety
npm run test-observation-queue
npm run test-x
npm run dashboard
npm run mission-control
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
