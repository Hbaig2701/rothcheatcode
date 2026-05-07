-- Admins need to read other users' profiles for the admin dashboard, support
-- centre, and advisors list. Original migration declared a policy with a
-- recursive subquery into profiles itself, which Postgres treats as
-- effectively broken — it blocked profile reads entirely, locking users out
-- of the dashboard via the subscription-status check.
--
-- Replaced with a SECURITY DEFINER helper that returns the caller's own
-- role without triggering RLS recursion. Safe because the function only
-- ever returns the role of the current user (auth.uid()), not anyone else.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (public.current_user_role() = 'admin');
