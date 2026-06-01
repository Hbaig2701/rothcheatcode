-- ============================================================
-- chat_assistant_flags — proactive hallucination tripwire
-- ============================================================
--
-- Every assistant message runs through lib/chat/hallucination-guard.ts.
-- When the guard catches a known bad pattern (claiming a form field that
-- doesn't exist, stating an SSI age limit that isn't 62/100, referencing
-- a Section number outside 1-9), a row lands here for retrospective
-- review. The bot's response is NOT blocked — we want to learn from real
-- production traffic, not silently filter it out. Admins surface the
-- table via the /admin/ai-chat panel.

CREATE TABLE IF NOT EXISTS chat_assistant_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK to the assistant chat_messages row that tripped the guard.
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  -- Denormalized for fast "what did THIS advisor see" queries.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Each label is a short string describing the suspected hallucination
  -- (e.g. "Claimed a 'Roth IRA balance field' in the form — no such
  -- input exists today.").
  flags jsonb NOT NULL,
  -- Admin sets this when they've reviewed and either decided it's a real
  -- false-positive or have shipped a KB / system-prompt fix.
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_flags_unreviewed
  ON chat_assistant_flags(created_at DESC) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_flags_conversation
  ON chat_assistant_flags(conversation_id, created_at DESC);

ALTER TABLE chat_assistant_flags ENABLE ROW LEVEL SECURITY;

-- Admins only. There's no per-advisor view here — these are internal-only
-- quality signals. The advisor sees the assistant message in their chat
-- regardless; they don't need to know it tripped a guard.
CREATE POLICY "Admins can read all flags" ON chat_assistant_flags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update flags" ON chat_assistant_flags
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Server inserts via service role only (the chat API route runs the guard
-- inline after persisting the assistant message). No advisor-facing INSERT
-- policy needed.
