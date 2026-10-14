-- Exact date of birth (client + spouse).
--
-- clients.date_of_birth / spouse_dob already exist, but every stored value is
-- synthesized on save as Jan 1 of (current year - age), so they can't be
-- trusted. These flags mark a DOB the advisor actually entered. When set, the
-- age the engine runs on is derived from the DOB each year (the age reached
-- during the calendar year — the IRS convention for RMDs, the 65+ deductions
-- and Medicare) instead of the stored age. Default false = existing behavior.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS date_of_birth_exact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spouse_dob_exact boolean NOT NULL DEFAULT false;
