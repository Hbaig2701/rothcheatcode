-- Allow advisors and admins to edit + delete their own support comments.
-- Adds updated_at so the UI can flag edited comments.

ALTER TABLE support_ticket_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE POLICY "Users can update own comments" ON support_ticket_comments
  FOR UPDATE USING (auth.uid() = user_id AND is_internal = false)
  WITH CHECK (auth.uid() = user_id AND is_internal = false);

CREATE POLICY "Users can delete own comments" ON support_ticket_comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any comment" ON support_ticket_comments
  FOR UPDATE USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
