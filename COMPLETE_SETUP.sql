-- 1. Setup Profiles Table (mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- Trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Manually insert existing users into profiles if they don't exist
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- 2. Setup Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Personal Information
  name TEXT NOT NULL,
  date_of_birth DATE,
  state TEXT,
  filing_status TEXT CHECK (filing_status IN ('single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household')),
  spouse_dob DATE,
  life_expectancy INTEGER,

  -- Account Balances (stored as cents)
  traditional_ira BIGINT NOT NULL DEFAULT 0,
  roth_ira BIGINT NOT NULL DEFAULT 0,
  taxable_accounts BIGINT NOT NULL DEFAULT 0,
  other_retirement BIGINT NOT NULL DEFAULT 0,

  -- Tax Configuration
  federal_bracket TEXT NOT NULL DEFAULT 'auto',
  state_tax_rate NUMERIC(5,2),
  include_niit BOOLEAN NOT NULL DEFAULT true,
  include_aca BOOLEAN NOT NULL DEFAULT false,

  -- Income Sources
  ss_self BIGINT NOT NULL DEFAULT 0,
  ss_spouse BIGINT NOT NULL DEFAULT 0,
  pension BIGINT NOT NULL DEFAULT 0,
  other_income BIGINT NOT NULL DEFAULT 0,
  ss_start_age INTEGER NOT NULL DEFAULT 67,

  -- Conversion Settings
  strategy TEXT NOT NULL DEFAULT 'moderate' CHECK (strategy IN ('conservative', 'moderate', 'aggressive', 'irmaa_safe')),
  start_age INTEGER NOT NULL DEFAULT 65,
  end_age INTEGER NOT NULL DEFAULT 75,
  tax_payment_source TEXT NOT NULL DEFAULT 'from_taxable' CHECK (tax_payment_source IN ('from_ira', 'from_taxable')),

  -- Advanced Options
  growth_rate NUMERIC(5,2) NOT NULL DEFAULT 6.0,
  inflation_rate NUMERIC(5,2) NOT NULL DEFAULT 2.5,
  heir_bracket TEXT NOT NULL DEFAULT '32',
  projection_years INTEGER NOT NULL DEFAULT 40,
  widow_analysis BOOLEAN NOT NULL DEFAULT false,
  sensitivity BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 3. Clients Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Users can view own clients') THEN
    CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Users can insert own clients') THEN
    CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Users can update own clients') THEN
     CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'Users can delete own clients') THEN
    CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;


-- 4. Setup Projections Table
CREATE TABLE IF NOT EXISTS public.projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  input_hash TEXT NOT NULL,

  break_even_age INTEGER,
  total_tax_savings BIGINT NOT NULL,
  heir_benefit BIGINT NOT NULL,

  baseline_final_traditional BIGINT NOT NULL,
  baseline_final_roth BIGINT NOT NULL,
  baseline_final_taxable BIGINT NOT NULL,
  baseline_final_net_worth BIGINT NOT NULL,

  blueprint_final_traditional BIGINT NOT NULL,
  blueprint_final_roth BIGINT NOT NULL,
  blueprint_final_taxable BIGINT NOT NULL,
  blueprint_final_net_worth BIGINT NOT NULL,

  baseline_years JSONB NOT NULL,
  blueprint_years JSONB NOT NULL,

  strategy TEXT NOT NULL,
  projection_years INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projections_client_id ON public.projections(client_id);
CREATE INDEX IF NOT EXISTS idx_projections_created_at ON public.projections(client_id, created_at DESC);

ALTER TABLE public.projections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projections' AND policyname = 'Users can view own projections') THEN
    CREATE POLICY "Users can view own projections" ON public.projections FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projections' AND policyname = 'Users can insert own projections') THEN
    CREATE POLICY "Users can insert own projections" ON public.projections FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projections' AND policyname = 'Users can delete own projections') THEN
    CREATE POLICY "Users can delete own projections" ON public.projections FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;


-- 5. Setup Audit Log
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.calculation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  client_snapshot JSONB NOT NULL,
  strategy TEXT NOT NULL,
  break_even_age INTEGER,
  total_tax_savings BIGINT NOT NULL,
  heir_benefit BIGINT NOT NULL,
  baseline_final_wealth BIGINT NOT NULL,
  blueprint_final_wealth BIGINT NOT NULL,
  calculation_ms INTEGER,
  engine_version TEXT NOT NULL DEFAULT '1.0.0'
);

CREATE OR REPLACE FUNCTION audit.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable - cannot modify or delete';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_audit_update ON audit.calculation_log;
CREATE TRIGGER prevent_audit_update
  BEFORE UPDATE OR DELETE ON audit.calculation_log
  FOR EACH ROW EXECUTE PROCEDURE audit.prevent_modification();

ALTER TABLE audit.calculation_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calculation_log' AND schemaname = 'audit' AND policyname = 'Users view own audit logs') THEN
    CREATE POLICY "Users view own audit logs" ON audit.calculation_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'calculation_log' AND schemaname = 'audit' AND policyname = 'Users insert own audit logs') THEN
    CREATE POLICY "Users insert own audit logs" ON audit.calculation_log FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
