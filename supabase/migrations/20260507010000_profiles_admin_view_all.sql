-- The original admin_dashboard migration (20260225120000) declared an
-- "Admins can view all profiles" SELECT policy on profiles, but it's not
-- present in the live database (likely never applied or dropped at some
-- point). Without it, admin pages that look up other users' profiles for
-- display — support centre detail, advisors list, etc. — get filtered to
-- only the admin's own row by RLS, so submitters/assignees rendered as
-- "Unknown" instead of their actual name + email.
--
-- Re-applying the policy. The recursive subquery is safe because
-- "Users can view own profile" already lets the user read their own
-- row to determine role, so the subquery doesn't loop.

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
