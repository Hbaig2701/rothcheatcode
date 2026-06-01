-- ============================================================
-- user_settings.chat_widget_enabled — per-advisor toggle for the
-- in-app AI assistant widget.
-- ============================================================
--
-- Defaults to TRUE so existing advisors keep the assistant visible.
-- Advisors who don't want it can flip it off in Settings → Appearance.
-- The flag only controls whether the floating launcher renders in the
-- dashboard layout; the underlying API routes stay accessible (so
-- internal admin tools and the support ticket reply path keep working).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS chat_widget_enabled boolean NOT NULL DEFAULT true;
