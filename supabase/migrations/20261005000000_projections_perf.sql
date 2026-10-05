-- Projections read performance.
--
-- The projections table is append-only (~20 rows per client for active
-- advisors), and the clients list + dashboard filter it by user_id ordered by
-- created_at. The only indexes were on client_id, so those reads scanned and
-- sorted the whole table.
--
-- 1. Index the user_id / created_at access path.
-- 2. Rewrite the RLS policies with (select auth.uid()) so Postgres evaluates
--    the caller's id once per statement instead of once per row (Supabase
--    RLS performance guidance). Semantics are unchanged from
--    20260507040000_projections_team_aware_rls.sql.

CREATE INDEX IF NOT EXISTS idx_projections_user_created
  ON projections (user_id, created_at DESC);

DROP POLICY IF EXISTS "Users can view own projections" ON projections;
CREATE POLICY "Users can view own projections" ON projections
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create own projections" ON projections;
CREATE POLICY "Users can create own projections" ON projections
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete own projections" ON projections;
CREATE POLICY "Users can delete own projections" ON projections
  FOR DELETE USING (
    (SELECT auth.uid()) = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = (SELECT auth.uid()))
  );
