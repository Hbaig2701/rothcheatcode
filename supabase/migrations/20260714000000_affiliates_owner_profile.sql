-- Self-serve affiliate enrollment.
--
-- Until now the affiliate program was admin-managed only: an admin created
-- an `affiliates` row by hand and mailed the partner their portal link.
-- There was no link between a logged-in advisor (profiles) and an affiliate
-- record, so an advisor could not enroll themselves.
--
-- `owner_profile_id` is that link. When an advisor opts into the referral
-- program from Settings → Refer & Earn, we find-or-create the affiliates row
-- keyed by this column. It is nullable so pre-existing admin-created
-- affiliates (who are not app users) keep working unchanged.

alter table affiliates
  add column if not exists owner_profile_id uuid references profiles(id) on delete set null;

-- One affiliate record per advisor. Partial unique index so the many
-- legacy rows with a NULL owner don't collide with each other.
create unique index if not exists affiliates_owner_profile_id_key
  on affiliates (owner_profile_id)
  where owner_profile_id is not null;
