-- Admins need to read clients owned by other advisors so the support
-- centre detail page can resolve "Re: ClientName" for tickets that
-- reference a client. Without this policy the lookup returns null and
-- we render "No client linked" even when the ticket DOES have a
-- client_id pointing to a real (other-advisor-owned) client.
--
-- Uses the existing SECURITY DEFINER helper (current_user_role) so
-- there's no recursive RLS issue.

CREATE POLICY "Admins can view all clients" ON clients
  FOR SELECT USING (public.current_user_role() = 'admin');
