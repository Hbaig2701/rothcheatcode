-- Permanent intake questionnaire links.
--
-- Original intake_links design assumed one link = one specific client:
-- single token, 7-day expiry, status flips to 'completed' on first submission.
-- That broke for advisors (e.g., Daven Sharma, ticket 2026-06-06) who wanted
-- to paste the link on their public website — the first prospect submitted,
-- the link "expired," and every subsequent visitor hit a 410.
--
-- This adds an opt-in 'is_permanent' flag. Permanent links bypass the
-- single-use logic in the API handlers: GET stays valid forever, POST
-- doesn't mark the link 'completed' and doesn't bind it to a single
-- client_id (each submission creates a fresh client under the advisor).
-- The advisor's client limit is still enforced per submission.

ALTER TABLE intake_links
  ADD COLUMN is_permanent BOOLEAN NOT NULL DEFAULT false;

-- Partial index for the rare lookup paths that want to enumerate an
-- advisor's permanent links (the management UI, the "find my website
-- link" recovery flow). Tiny — almost all rows stay single-use.
CREATE INDEX idx_intake_links_user_permanent
  ON intake_links(user_id)
  WHERE is_permanent = true;
