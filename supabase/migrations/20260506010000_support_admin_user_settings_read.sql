-- Allow admins to read everyone's user_settings (for displaying advisor names in /support-centre)
CREATE POLICY "Admins can view all user settings" ON user_settings
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
