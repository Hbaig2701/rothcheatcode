-- ============================================================
-- Stripe Billing & Team Members Migration
-- ============================================================

-- 1. Add subscription fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'none';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cycle text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_owner_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);

-- 2. Create usage table for tracking monthly limits
CREATE TABLE IF NOT EXISTS usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  scenario_runs int NOT NULL DEFAULT 0,
  pdf_exports int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);

ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON usage
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage" ON usage
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(team_owner_id, email)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage team" ON team_members
  FOR ALL USING (auth.uid() = team_owner_id);

CREATE POLICY "Members can view own membership" ON team_members
  FOR SELECT USING (auth.uid() = member_user_id);

-- 4. Update clients RLS to allow team members to access owner's clients
-- Drop existing SELECT policy and recreate with team support
DROP POLICY IF EXISTS "Users can view own clients" ON clients;
CREATE POLICY "Users can view own clients" ON clients
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );

-- Also allow team members to update/delete owner's clients
DROP POLICY IF EXISTS "Users can update own clients" ON clients;
CREATE POLICY "Users can update own clients" ON clients
  FOR UPDATE USING (
    user_id = auth.uid()
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own clients" ON clients;
CREATE POLICY "Users can delete own clients" ON clients
  FOR DELETE USING (
    user_id = auth.uid()
    OR user_id = (SELECT team_owner_id FROM profiles WHERE id = auth.uid())
  );

-- 5. Grandfather all existing users as Pro
UPDATE profiles SET plan = 'pro', subscription_status = 'active' WHERE plan = 'none' OR plan IS NULL;
