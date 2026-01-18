-- Add remaining 25 fields to clients table
-- Phase 03: Client Data Entry Form
-- Migration: Extend clients from 4 core fields to 28 total fields

-- Personal Information (2 new fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS spouse_dob DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS life_expectancy INTEGER;

-- Account Balances (4 fields) - stored as cents (BIGINT for large amounts)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS traditional_ira BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS roth_ira BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS taxable_accounts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_retirement BIGINT NOT NULL DEFAULT 0;

-- Tax Configuration (4 fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS federal_bracket TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state_tax_rate NUMERIC(5,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS include_niit BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS include_aca BOOLEAN NOT NULL DEFAULT false;

-- Income Sources (5 fields) - stored as cents
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ss_self BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ss_spouse BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pension BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_income BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ss_start_age INTEGER NOT NULL DEFAULT 67;

-- Conversion Settings (4 fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT 'moderate';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS start_age INTEGER NOT NULL DEFAULT 65;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS end_age INTEGER NOT NULL DEFAULT 75;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_payment_source TEXT NOT NULL DEFAULT 'from_taxable';

-- Advanced Options (6 fields)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS growth_rate NUMERIC(5,2) NOT NULL DEFAULT 6.0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS inflation_rate NUMERIC(5,2) NOT NULL DEFAULT 2.5;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS heir_bracket TEXT NOT NULL DEFAULT '32';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS projection_years INTEGER NOT NULL DEFAULT 40;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS widow_analysis BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sensitivity BOOLEAN NOT NULL DEFAULT false;

-- Add check constraints for enum-like fields
ALTER TABLE clients ADD CONSTRAINT check_strategy
  CHECK (strategy IN ('conservative', 'moderate', 'aggressive', 'irmaa_safe'));
ALTER TABLE clients ADD CONSTRAINT check_tax_payment_source
  CHECK (tax_payment_source IN ('from_ira', 'from_taxable'));

-- Add comments for documentation
COMMENT ON COLUMN clients.traditional_ira IS 'Traditional IRA balance in cents';
COMMENT ON COLUMN clients.roth_ira IS 'Roth IRA balance in cents';
COMMENT ON COLUMN clients.taxable_accounts IS 'Taxable account balance in cents';
COMMENT ON COLUMN clients.other_retirement IS 'Other retirement accounts in cents';
COMMENT ON COLUMN clients.ss_self IS 'Annual Social Security benefit (self) in cents';
COMMENT ON COLUMN clients.ss_spouse IS 'Annual Social Security benefit (spouse) in cents';
COMMENT ON COLUMN clients.pension IS 'Annual pension income in cents';
COMMENT ON COLUMN clients.other_income IS 'Other annual income in cents';
COMMENT ON COLUMN clients.strategy IS 'Conversion strategy: conservative, moderate, aggressive, irmaa_safe';
COMMENT ON COLUMN clients.tax_payment_source IS 'Source for conversion tax: from_ira or from_taxable';
COMMENT ON COLUMN clients.sensitivity IS 'Run sensitivity analysis on key assumptions';
