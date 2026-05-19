-- ============================================================
-- Admin metrics cache (cross-instance)
-- ============================================================
--
-- Vercel serverless runs multiple instances. The in-memory cache the
-- revenue route had only worked on cache HITS from the same instance —
-- refreshes that hit a different instance triggered a full Stripe rebuild
-- on every request. Combined with charge-pagination flakiness, that made
-- MRR / lifetime revenue numbers fluctuate between refreshes.
--
-- This table is a shared cache. Single row per metric key, refreshed on
-- a TTL. Admin-only access (only the admin client writes to it; only the
-- admin client reads via API routes that bypass RLS).

CREATE TABLE IF NOT EXISTS admin_metrics_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_metrics_cache_computed_at
  ON admin_metrics_cache(computed_at DESC);

-- RLS off — only the admin client (service role) reads/writes this table.
-- The route handlers verify admin role before touching it.
ALTER TABLE admin_metrics_cache ENABLE ROW LEVEL SECURITY;

-- No SELECT policies for non-admins. Admins can view all via the bypass.
CREATE POLICY "Admins can view metrics cache" ON admin_metrics_cache
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
