-- Client contact information.
--
-- The clients table historically tracked planning-side data only (name, age,
-- IRA balances, etc.) under the assumption that the advisor already knew the
-- client out-of-band. That assumption broke with permanent intake links
-- (2026-06-06 release) — prospects now submit the questionnaire via an
-- advisor's public website with no prior contact, so the advisor has the
-- planning data but no way to follow up.
--
-- Ticket: Daven Sharma, 2026-06-08 ("Client Phone # or Email Address").
--
-- Both fields are nullable so existing rows stay valid; the intake form
-- requires email (the high-signal follow-up channel) and treats phone as
-- optional. Manually-created clients in the advisor's own form may leave
-- both empty.

ALTER TABLE clients
  ADD COLUMN client_email TEXT,
  ADD COLUMN client_phone TEXT;
