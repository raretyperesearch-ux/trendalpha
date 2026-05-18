-- ============================================================
-- OINK live scanner schema repair
-- ============================================================
-- Safe to run more than once in the Supabase SQL editor.
-- Adds/repairs narrative memory, shadow launch, deployment,
-- asset, mint, and creator-fee tables used by Railway scans.
-- ============================================================

CREATE TABLE IF NOT EXISTS narrative_cluster_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  cluster_name TEXT DEFAULT 'Narrative Cluster',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  narrative_phase TEXT DEFAULT 'emerging',
  momentum_state TEXT DEFAULT 'stable',
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
  snapshot JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE narrative_cluster_snapshots
  ADD COLUMN IF NOT EXISTS cluster_name TEXT DEFAULT 'Narrative Cluster',
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
  ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_narrative_clusters_cluster_id ON narrative_cluster_snapshots(cluster_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_clusters_timestamp ON narrative_cluster_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_clusters_phase ON narrative_cluster_snapshots(narrative_phase);
CREATE INDEX IF NOT EXISTS idx_narrative_clusters_launch_readiness ON narrative_cluster_snapshots(launch_readiness DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_clusters_persistence ON narrative_cluster_snapshots(persistence_score DESC);

CREATE TABLE IF NOT EXISTS shadow_launches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  launch_id TEXT UNIQUE,
  cluster_id TEXT,
  ticker TEXT,
  title TEXT,
  launch_readiness INT DEFAULT 0,
  narrative_phase TEXT DEFAULT 'forming',
  swarm_pressure INT DEFAULT 0,
  identity_strength INT DEFAULT 0,
  launch_reasoning JSONB DEFAULT '[]'::jsonb,
  payload JSONB DEFAULT '{}'::jsonb,
  lifecycle_state TEXT DEFAULT 'preparing',
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  ADD COLUMN IF NOT EXISTS launch_reasoning JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'preparing',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_shadow_launches_launch_id ON shadow_launches(launch_id);
CREATE INDEX IF NOT EXISTS idx_shadow_launches_cluster_id ON shadow_launches(cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_launches_ticker ON shadow_launches(ticker);
CREATE INDEX IF NOT EXISTS idx_shadow_launches_readiness ON shadow_launches(launch_readiness DESC);

CREATE TABLE IF NOT EXISTS deployment_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id TEXT UNIQUE,
  cluster_id TEXT,
  ticker TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  deployment_state TEXT DEFAULT 'preparing',
  validation_result JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  state_timeline JSONB DEFAULT '[]'::jsonb,
  failure_class TEXT,
  simulation_result JSONB DEFAULT '{}'::jsonb,
  observation_state TEXT,
  mint TEXT,
  tx_signature TEXT,
  metadata_uri TEXT,
  image_uri TEXT,
  image_cid TEXT,
  metadata_cid TEXT,
  launch_timestamp TIMESTAMPTZ,
  confirmation_latency_ms INT DEFAULT 0,
  launch_score INT DEFAULT 0,
  selected_identity JSONB DEFAULT '{}'::jsonb,
  source_post_url TEXT,
  source_platform TEXT,
  mode TEXT DEFAULT 'DRY_WIRE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deployment_attempts
  ADD COLUMN IF NOT EXISTS attempt_id TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deployment_state TEXT DEFAULT 'preparing',
  ADD COLUMN IF NOT EXISTS validation_result JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS state_timeline JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS failure_class TEXT,
  ADD COLUMN IF NOT EXISTS simulation_result JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS observation_state TEXT,
  ADD COLUMN IF NOT EXISTS mint TEXT,
  ADD COLUMN IF NOT EXISTS tx_signature TEXT,
  ADD COLUMN IF NOT EXISTS metadata_uri TEXT,
  ADD COLUMN IF NOT EXISTS image_uri TEXT,
  ADD COLUMN IF NOT EXISTS image_cid TEXT,
  ADD COLUMN IF NOT EXISTS metadata_cid TEXT,
  ADD COLUMN IF NOT EXISTS launch_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_latency_ms INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS launch_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_identity JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_post_url TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'DRY_WIRE',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_attempts_attempt_id ON deployment_attempts(attempt_id);
CREATE INDEX IF NOT EXISTS idx_deployment_attempts_cluster_id ON deployment_attempts(cluster_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_attempts_state ON deployment_attempts(deployment_state);
CREATE INDEX IF NOT EXISTS idx_deployment_attempts_idempotency ON deployment_attempts(idempotency_key);

CREATE TABLE IF NOT EXISTS launch_assets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  launch_id TEXT,
  cluster_id TEXT,
  ticker TEXT,
  asset_type TEXT DEFAULT 'launch_image',
  prompt TEXT,
  image_url TEXT,
  local_path TEXT,
  source_platform TEXT,
  source_post_url TEXT,
  source_author TEXT,
  source_media_url TEXT,
  source_media_type TEXT,
  source_backlink TEXT,
  uploaded_image_url TEXT,
  thumbnail_url TEXT,
  metadata_url TEXT,
  content_hash TEXT,
  upload_provider TEXT,
  upload_status TEXT,
  metadata_frozen BOOLEAN DEFAULT FALSE,
  frozen_package_hash TEXT,
  mime_type TEXT,
  byte_size INT DEFAULT 0,
  width INT DEFAULT 0,
  height INT DEFAULT 0,
  image_quality_review JSONB DEFAULT '{}'::jsonb,
  artifact_score JSONB DEFAULT '{}'::jsonb,
  quality_score INT DEFAULT 0,
  validation_status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE launch_assets
  ADD COLUMN IF NOT EXISTS launch_id TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'launch_image',
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS local_path TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS source_post_url TEXT,
  ADD COLUMN IF NOT EXISTS source_author TEXT,
  ADD COLUMN IF NOT EXISTS source_media_url TEXT,
  ADD COLUMN IF NOT EXISTS source_media_type TEXT,
  ADD COLUMN IF NOT EXISTS source_backlink TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata_url TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS upload_provider TEXT,
  ADD COLUMN IF NOT EXISTS upload_status TEXT,
  ADD COLUMN IF NOT EXISTS metadata_frozen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS frozen_package_hash TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS byte_size INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS height INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_quality_review JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS artifact_score JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_launch_assets_launch_id ON launch_assets(launch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_launch_assets_ticker ON launch_assets(ticker);
CREATE INDEX IF NOT EXISTS idx_launch_assets_validation ON launch_assets(validation_status);

CREATE TABLE IF NOT EXISTS deployed_token_mints (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mint TEXT UNIQUE,
  ticker TEXT,
  token_name TEXT,
  launch_timestamp TIMESTAMPTZ,
  deploy_wallet TEXT,
  tx_signature TEXT,
  creator_fee_status TEXT DEFAULT 'pending',
  source_cluster_id TEXT,
  source_platform TEXT,
  source_url TEXT,
  launch_score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deployed_token_mints
  ADD COLUMN IF NOT EXISTS mint TEXT,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS token_name TEXT,
  ADD COLUMN IF NOT EXISTS launch_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deploy_wallet TEXT,
  ADD COLUMN IF NOT EXISTS tx_signature TEXT,
  ADD COLUMN IF NOT EXISTS creator_fee_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source_cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS launch_score INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_deployed_token_mints_mint ON deployed_token_mints(mint);
CREATE INDEX IF NOT EXISTS idx_deployed_token_mints_status ON deployed_token_mints(creator_fee_status);

CREATE TABLE IF NOT EXISTS creator_fee_claims (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mint TEXT,
  pool TEXT DEFAULT 'pump',
  status TEXT DEFAULT 'pending',
  estimated_creator_fees_sol NUMERIC DEFAULT 0,
  claimed_sol NUMERIC DEFAULT 0,
  tx_signature TEXT,
  failure_class TEXT,
  confirmation_latency_ms INT DEFAULT 0,
  recovery_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_fee_claims
  ADD COLUMN IF NOT EXISTS mint TEXT,
  ADD COLUMN IF NOT EXISTS pool TEXT DEFAULT 'pump',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS estimated_creator_fees_sol NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_sol NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tx_signature TEXT,
  ADD COLUMN IF NOT EXISTS failure_class TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_latency_ms INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_path TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_creator_fee_claims_mint ON creator_fee_claims(mint);
CREATE INDEX IF NOT EXISTS idx_creator_fee_claims_status ON creator_fee_claims(status);
