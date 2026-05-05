-- Custom Products table — user-created product presets via AI Builder or manual
-- Plugs into existing engine via engine_preset (one of the 9 system FormulaType values).
-- Form defaults are sourced from config JSONB; engine dispatch unchanged.

CREATE TABLE IF NOT EXISTS public.custom_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Display
  name text NOT NULL,                        -- Editable display name (advisor-chosen, often generic)
  carrier_name text,                         -- Original carrier (private notes)
  carrier_product_name text,                 -- Original product name (private notes)

  -- Classification
  category text NOT NULL CHECK (category IN ('growth', 'income')),
  archetype text NOT NULL,                   -- Spec archetype: growth-vesting, income-simple-both, etc.
  engine_preset text NOT NULL,               -- Existing FormulaType for engine dispatch
  modifier_flags text[] NOT NULL DEFAULT '{}',

  -- Full config payload (form defaults + extended params)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_research', 'ai_document', 'duplicated_from_preset')),
  ai_research_sources jsonb,
  ai_warnings jsonb,
  ai_unsupported_features jsonb,

  -- State
  is_favorite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT custom_products_user_name_unique UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_products_user ON public.custom_products(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_products_user_category ON public.custom_products(user_id, category);
CREATE INDEX IF NOT EXISTS idx_custom_products_user_archived ON public.custom_products(user_id, is_archived);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_custom_products_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_products_updated_at ON public.custom_products;
CREATE TRIGGER trg_custom_products_updated_at
  BEFORE UPDATE ON public.custom_products
  FOR EACH ROW EXECUTE FUNCTION public.set_custom_products_updated_at();

-- RLS: user-scoped
ALTER TABLE public.custom_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_custom_products" ON public.custom_products;
CREATE POLICY "users_select_own_custom_products" ON public.custom_products
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_custom_products" ON public.custom_products;
CREATE POLICY "users_insert_own_custom_products" ON public.custom_products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_custom_products" ON public.custom_products;
CREATE POLICY "users_update_own_custom_products" ON public.custom_products
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_custom_products" ON public.custom_products;
CREATE POLICY "users_delete_own_custom_products" ON public.custom_products
  FOR DELETE USING (auth.uid() = user_id);

-- Add custom_product_id to clients (nullable; when set, indicates client uses a custom product
-- but engine dispatch still goes through blueprint_type which holds the engine_preset value)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS custom_product_id uuid REFERENCES public.custom_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_custom_product ON public.clients(custom_product_id)
  WHERE custom_product_id IS NOT NULL;
