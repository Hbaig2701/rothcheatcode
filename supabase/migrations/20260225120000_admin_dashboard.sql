-- ============================================================
-- Admin Analytics Dashboard Migration
-- ============================================================

-- 1. Add role column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'advisor';

-- Set admin accounts
UPDATE profiles SET role = 'admin' WHERE email IN ('allan@vroommediagroup.com', 'hamza@hexonasystems.com');

-- 2. Create login_log table
CREATE TABLE IF NOT EXISTS login_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_log_user_id ON login_log(user_id);
CREATE INDEX IF NOT EXISTS idx_login_log_created_at ON login_log(created_at);

ALTER TABLE login_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own logins" ON login_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all logins" ON login_log
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. Create export_log table
CREATE TABLE IF NOT EXISTS export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  client_id uuid REFERENCES clients(id) NOT NULL,
  export_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_log_user_id ON export_log(user_id);
CREATE INDEX IF NOT EXISTS idx_export_log_created_at ON export_log(created_at);

ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own exports" ON export_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all exports" ON export_log
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. Admin RLS policies for existing tables

-- calculation_log: admins can view all
CREATE POLICY "Admins can view all calculations" ON calculation_log
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- clients: admins can view all
CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- profiles: admins can view all
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
