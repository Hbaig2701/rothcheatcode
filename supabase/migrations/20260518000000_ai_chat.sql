-- ============================================================
-- AI Chat (Advisor-facing in-app assistant)
-- ============================================================
--
-- Two tables:
--   chat_conversations — one row per thread, surfaced in the widget's
--     conversation list and the admin "AI Chat" tab.
--   chat_messages — one row per message (user or assistant), with per-message
--     token usage + cost so admin analytics can roll up by day/user/conversation
--     without a separate aggregate table. Volume is modest (estimated <1M
--     rows/yr at current advisor count), so on-demand aggregation is fine.
--
-- All inserts happen server-side. RLS still scopes reads/writes to the
-- conversation owner; admins can view-all for the admin panel.

-- 1. chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Auto-generated from the first user message (first ~60 chars), editable.
  -- Nullable until the first message lands.
  title text,
  -- Mirrors the latest chat_messages.created_at so the conversation list can
  -- sort without a join. Set by the API route on every insert.
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- Soft-delete flag. The widget hides archived conversations by default but
  -- the admin panel can still see them. Hard delete cascades messages.
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_recent
  ON chat_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_recent
  ON chat_conversations(last_message_at DESC);

CREATE OR REPLACE FUNCTION set_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_chat_conversations_updated_at();

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON chat_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON chat_conversations
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations" ON chat_conversations
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all conversations" ON chat_conversations
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- 2. chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  -- Denormalized so RLS on messages can check ownership without a join.
  -- Set by the API route to the conversation's user_id at insert time.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'user' = advisor's message; 'assistant' = Claude's reply; 'tool' = tool result
  -- block (kept as its own row for debuggability in the admin panel).
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  -- Rendered text content (markdown). Always populated for user + assistant.
  -- For 'tool' rows this is a short summary like "Looked up client X (245ms)".
  content text NOT NULL,
  -- Full structured blocks as sent to / received from the Anthropic API.
  -- Captures tool_use, tool_result, image, and multi-block assistant content
  -- so the admin panel can show exactly what the model did.
  content_blocks jsonb,
  -- Primary image attachment URL when the user pasted/uploaded a screenshot.
  -- Stored separately so the widget can render the thumbnail without parsing
  -- content_blocks. Multiple images per message land in content_blocks.
  attachment_url text,
  -- Per-message Anthropic usage metrics. NULLs on 'user' and 'tool' rows
  -- (only the assistant row is billed). Cached read/creation tokens tracked
  -- separately so the admin panel can show cache-hit rate.
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_creation_tokens int,
  -- Computed by the API route at insert time using current Anthropic pricing.
  -- Pricing baked into the route, not the DB, so a price change doesn't
  -- retroactively rewrite history.
  cost_usd numeric(10, 6),
  -- e.g. 'claude-haiku-4-5-20251001' or 'claude-sonnet-4-6'.
  model text,
  -- Whether this assistant message escalated into a support ticket via the
  -- create_support_ticket tool. Surfaces "AI Chat → Tickets created" analytics.
  created_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_day
  ON chat_messages(user_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages" ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE/DELETE policies for users — chat history is an immutable audit
-- log. Deleting a conversation cascades messages; that's the only way to
-- remove them.

CREATE POLICY "Admins can view all messages" ON chat_messages
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
