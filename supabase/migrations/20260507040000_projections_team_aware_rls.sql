-- Projections RLS was strict-per-user (auth.uid() = user_id) while clients
-- RLS already supports team members reading the owner's clients. The
-- mismatch meant a team member viewing the owner's client got cache misses
-- on every projection read (they could see the client but not the cached
-- projection rows attached to it), forcing a full recomputation each time.
--
-- This migration mirrors the team logic from 20260305000000_stripe_billing.sql
-- onto the projections table so team members can SELECT/INSERT/DELETE
-- projections owned by their team_owner.

DROP POLICY IF EXISTS "Users can view own projections" ON projections;
CREATE POLICY "Users can view own projections" ON projections
  FOR SELECT USING (
    auth.uid() = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create own projections" ON projections;
CREATE POLICY "Users can create own projections" ON projections
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own projections" ON projections;
CREATE POLICY "Users can delete own projections" ON projections
  FOR DELETE USING (
    auth.uid() = user_id
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );
