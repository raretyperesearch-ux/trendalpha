-- ============================================================
-- TRENDALPHA — SUPABASE MIGRATION
-- ============================================================
-- Run this in the Supabase SQL editor (supabase.com dashboard)
-- Creates tables for trend tracking and alert history
-- ============================================================

-- Trend snapshots — one row per trend per scan
CREATE TABLE IF NOT EXISTS trend_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trend_id TEXT NOT NULL,
  trend_name TEXT NOT NULL,
  trend_type TEXT NOT NULL, -- 'sound', 'hashtag', 'effect'
  total_views BIGINT DEFAULT 0,
  video_count INT DEFAULT 0,
  views_per_hour INT DEFAULT 0,
  score INT DEFAULT 0,
  score_breakdown JSONB DEFAULT '{}',
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by trend_id (for acceleration calc)
CREATE INDEX IF NOT EXISTS idx_snapshots_trend_id 
  ON trend_snapshots(trend_id, scanned_at DESC);

-- Alerts sent — one row per alert pushed to Telegram
CREATE TABLE IF NOT EXISTS alerts_sent (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trend_id TEXT NOT NULL,
  trend_name TEXT NOT NULL,
  score INT NOT NULL,
  token_found BOOLEAN DEFAULT FALSE,
  token_name TEXT,
  token_address TEXT,
  token_chain TEXT,
  token_price_at_alert TEXT,
  token_mcap_at_alert BIGINT,
  -- For hit rate tracking (update these later)
  token_price_after_24h TEXT,
  was_hit BOOLEAN, -- true if price went up 50%+ in 24h
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for deduplication check
CREATE INDEX IF NOT EXISTS idx_alerts_dedup 
  ON alerts_sent(trend_id, sent_at DESC);

-- Index for hit rate queries
CREATE INDEX IF NOT EXISTS idx_alerts_hitrate 
  ON alerts_sent(sent_at DESC, was_hit);

-- Narrative cluster snapshots — persistent memory for lifecycle intelligence
CREATE TABLE IF NOT EXISTS narrative_cluster_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  cluster_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  narrative_phase TEXT NOT NULL DEFAULT 'emerging',
  momentum_state TEXT NOT NULL DEFAULT 'stable',
  propagation_shape TEXT,
  launch_worthiness INT DEFAULT 0,
  persistence_score INT DEFAULT 0,
  identity_strength INT DEFAULT 0,
  swarm_pressure INT DEFAULT 0,
  narrative_uniqueness INT DEFAULT 0,
  launch_readiness INT DEFAULT 0,
  total_attention BIGINT DEFAULT 0,
  total_posts INT DEFAULT 0,
  total_accounts INT DEFAULT 0,
  cross_community_score INT DEFAULT 0,
  remixability_score INT DEFAULT 0,
  saturation_score INT DEFAULT 0,
  acceleration_score INT DEFAULT 0,
  snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE narrative_cluster_snapshots
  ADD COLUMN IF NOT EXISTS cluster_name TEXT,
  ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS narrative_phase TEXT DEFAULT 'emerging',
  ADD COLUMN IF NOT EXISTS momentum_state TEXT DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS propagation_shape TEXT,
  ADD COLUMN IF NOT EXISTS launch_worthiness INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS persistence_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_strength INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS swarm_pressure INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS narrative_uniqueness INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_readiness INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_attention BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_posts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_accounts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cross_community_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remixability_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saturation_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceleration_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_cluster_id
  ON narrative_cluster_snapshots(cluster_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_timestamp
  ON narrative_cluster_snapshots(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_phase
  ON narrative_cluster_snapshots(narrative_phase);

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_launch_readiness
  ON narrative_cluster_snapshots(launch_readiness DESC);

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_persistence
  ON narrative_cluster_snapshots(persistence_score DESC);

-- Shadow launches — dry-run deployment metadata only, no transactions
CREATE TABLE IF NOT EXISTS shadow_launches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  launch_id TEXT NOT NULL UNIQUE,
  cluster_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  launch_readiness INT DEFAULT 0,
  narrative_phase TEXT DEFAULT 'forming',
  swarm_pressure INT DEFAULT 0,
  identity_strength INT DEFAULT 0,
  launch_reasoning JSONB DEFAULT '[]',
  payload JSONB DEFAULT '{}',
  lifecycle_state TEXT DEFAULT 'preparing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shadow_launches
  ADD COLUMN IF NOT EXISTS launch_id TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS launch_readiness INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS narrative_phase TEXT DEFAULT 'forming',
  ADD COLUMN IF NOT EXISTS swarm_pressure INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_strength INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_reasoning JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'preparing',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_shadow_launches_cluster_id
  ON shadow_launches(cluster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_launches_ticker
  ON shadow_launches(ticker);

CREATE INDEX IF NOT EXISTS idx_shadow_launches_readiness
  ON shadow_launches(launch_readiness DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_launches_phase
  ON shadow_launches(narrative_phase);

-- Deployment attempts — PumpPortal dry-wire/live skeleton audit, no secrets
CREATE TABLE IF NOT EXISTS deployment_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  cluster_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  deployment_state TEXT DEFAULT 'preparing',
  validation_result JSONB DEFAULT '{}',
  mode TEXT DEFAULT 'DRY_WIRE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deployment_attempts
  ADD COLUMN IF NOT EXISTS attempt_id TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deployment_state TEXT DEFAULT 'preparing',
  ADD COLUMN IF NOT EXISTS validation_result JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'DRY_WIRE',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_deployment_attempts_cluster_id
  ON deployment_attempts(cluster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deployment_attempts_ticker
  ON deployment_attempts(ticker);

CREATE INDEX IF NOT EXISTS idx_deployment_attempts_state
  ON deployment_attempts(deployment_state);

-- Launch image/metadata assets — dry-wire asset preparation only
CREATE TABLE IF NOT EXISTS launch_assets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  launch_id TEXT NOT NULL,
  cluster_id TEXT,
  ticker TEXT,
  asset_type TEXT DEFAULT 'launch_image',
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  quality_score INT DEFAULT 0,
  validation_status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE launch_assets
  ADD COLUMN IF NOT EXISTS launch_id TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'launch_image',
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS local_path TEXT,
  ADD COLUMN IF NOT EXISTS quality_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_launch_assets_launch_id
  ON launch_assets(launch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_launch_assets_ticker
  ON launch_assets(ticker);

CREATE INDEX IF NOT EXISTS idx_launch_assets_validation
  ON launch_assets(validation_status);

-- ============================================================
-- OPTIONAL: Row Level Security (enable if you want)
-- ============================================================
-- ALTER TABLE trend_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE alerts_sent ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Allow service role full access" ON trend_snapshots
--   FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Allow service role full access" ON alerts_sent
--   FOR ALL USING (auth.role() = 'service_role');
