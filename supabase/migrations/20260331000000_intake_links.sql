-- Intake links: allow advisors to generate public questionnaire URLs for clients
CREATE TABLE intake_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast token lookups (public access)
CREATE INDEX idx_intake_links_token ON intake_links(token);

-- Index for advisor listing their own links
CREATE INDEX idx_intake_links_user_id ON intake_links(user_id);

-- RLS
ALTER TABLE intake_links ENABLE ROW LEVEL SECURITY;

-- Advisors can read their own links
CREATE POLICY "Users can view own intake links"
  ON intake_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Advisors can create their own links
CREATE POLICY "Users can create own intake links"
  ON intake_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Advisors can update their own links
CREATE POLICY "Users can update own intake links"
  ON intake_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
