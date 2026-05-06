-- ============================================================
-- Support Ticketing System
-- ============================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE support_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_category AS ENUM ('bug', 'data_issue', 'feature_request', 'question', 'billing', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_status AS ENUM ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  report_id uuid REFERENCES report_history(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  severity support_severity NOT NULL DEFAULT 'medium',
  priority support_priority NOT NULL DEFAULT 'medium',
  category support_category NOT NULL DEFAULT 'other',
  status support_status NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);

CREATE OR REPLACE FUNCTION set_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_support_tickets_updated_at();

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets" ON support_tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tickets" ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets" ON support_tickets
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all tickets" ON support_tickets
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can update all tickets" ON support_tickets
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete tickets" ON support_tickets
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 3. support_ticket_attachments
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket_id ON support_ticket_attachments(ticket_id);

ALTER TABLE support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ticket attachments" ON support_ticket_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ticket attachments" ON support_ticket_attachments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all attachments" ON support_ticket_attachments
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can insert attachments" ON support_ticket_attachments
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete attachments" ON support_ticket_attachments
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 4. support_ticket_comments
CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_comments_ticket_id ON support_ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_comments_created_at ON support_ticket_comments(created_at);

ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public comments on own tickets" ON support_ticket_comments
  FOR SELECT USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_comments.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert public comments on own tickets" ON support_ticket_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_comments.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all comments" ON support_ticket_comments
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can insert any comments" ON support_ticket_comments
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete comments" ON support_ticket_comments
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 5. support_ticket_events (audit trail)
CREATE TABLE IF NOT EXISTS support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_events_ticket_id ON support_ticket_events(ticket_id);

ALTER TABLE support_ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events on own tickets" ON support_ticket_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_events.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert events on own tickets" ON support_ticket_events
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_events.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all events" ON support_ticket_events
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can insert events" ON support_ticket_events
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 6. Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can upload to own ticket folders" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'support-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM support_tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.user_id = auth.uid()
      )
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  );

CREATE POLICY "Users can read own ticket files" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'support-attachments'
    AND (
      EXISTS (
        SELECT 1 FROM support_tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.user_id = auth.uid()
      )
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  );

CREATE POLICY "Admins can delete ticket files" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'support-attachments'
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
