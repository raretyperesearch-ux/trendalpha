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
