-- Community Products — a platform-curated catalog advisors can browse and copy
-- into their own My Products (custom_products) with one click.
--
-- Design: COPY-ON-ADOPT. A community product is a read-only master template.
-- "Adopting" it inserts an independent copy into the advisor's custom_products
-- (their user_id), so they own/edit their copy and the existing engine pipeline
-- (clients.custom_product_id -> custom_products) is untouched.
--
-- Authoring is service-role only (seed/promote scripts bypass RLS). Advisors can
-- only SELECT published rows — they never write to this table directly.

CREATE TABLE IF NOT EXISTS public.community_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display
  name text NOT NULL,
  description text,                          -- optional catalog blurb (admin-authored)
  carrier_name text,                         -- factual metadata (the real carrier)
  carrier_product_name text,                 -- factual metadata (the real product name)

  -- Classification (same shape as custom_products for a clean copy)
  category text NOT NULL CHECK (category IN ('growth', 'income')),
  archetype text NOT NULL,
  engine_preset text NOT NULL,
  modifier_flags text[] NOT NULL DEFAULT '{}',

  -- Full config payload (identical shape to custom_products.config)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance: which advisor product this catalog entry was promoted from,
  -- and which admin promoted it. Records the real chain — no fiction.
  source_custom_product_id uuid,             -- nullable; original may be edited/deleted later
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Publication
  is_published boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT community_products_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_community_products_published
  ON public.community_products(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_community_products_category
  ON public.community_products(category);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_community_products_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_products_updated_at ON public.community_products;
CREATE TRIGGER trg_community_products_updated_at
  BEFORE UPDATE ON public.community_products
  FOR EACH ROW EXECUTE FUNCTION public.set_community_products_updated_at();

-- RLS: any authenticated advisor may READ published catalog entries.
-- No INSERT/UPDATE/DELETE policies -> only the service role (seed/promote
-- scripts) can author. This keeps the catalog platform-controlled.
ALTER TABLE public.community_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_select_published_community_products" ON public.community_products;
CREATE POLICY "anyone_select_published_community_products" ON public.community_products
  FOR SELECT USING (is_published = true);

-- Allow custom_products to record that a copy came from the Community catalog.
-- (a) extend the source CHECK with 'adopted_from_community'
-- (b) add a provenance FK back to the catalog entry it was copied from
ALTER TABLE public.custom_products DROP CONSTRAINT IF EXISTS custom_products_source_check;
ALTER TABLE public.custom_products ADD CONSTRAINT custom_products_source_check
  CHECK (source IN ('manual', 'ai_research', 'ai_document', 'duplicated_from_preset', 'adopted_from_community'));

ALTER TABLE public.custom_products
  ADD COLUMN IF NOT EXISTS community_product_id uuid
    REFERENCES public.community_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_custom_products_community
  ON public.custom_products(community_product_id) WHERE community_product_id IS NOT NULL;
