/**
 * Community Products repository — the platform-curated catalog.
 *
 * Reads are RLS-scoped to published rows (any authenticated advisor). The
 * "adopt" flow COPIES a catalog entry into the advisor's own custom_products
 * so they own an independent, editable copy. Provenance is recorded via
 * source = 'adopted_from_community' and community_product_id.
 */

import { createClient } from "@/lib/supabase/server";
import type { CommunityProductRow, CustomProductRow } from "./types";

export async function listCommunityProducts(): Promise<CommunityProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_products")
    .select("*")
    .eq("is_published", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`listCommunityProducts: ${error.message}`);
  return (data ?? []) as CommunityProductRow[];
}

export async function getCommunityProduct(productId: string): Promise<CommunityProductRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_products")
    .select("*")
    .eq("id", productId)
    .eq("is_published", true)
    .maybeSingle();

  if (error) throw new Error(`getCommunityProduct: ${error.message}`);
  return (data as CommunityProductRow | null) ?? null;
}

export class CommunityAdoptError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "duplicate_name"
  ) {
    super(message);
    this.name = "CommunityAdoptError";
  }
}

/**
 * Copy a published Community product into the advisor's My Products.
 * Returns the newly created custom_products row.
 *
 * The copy is independent: editing or removing it does not affect the catalog,
 * and editing the catalog later does not change products advisors have already
 * adopted (and may be actively quoting clients on).
 */
export async function adoptCommunityProduct(
  userId: string,
  communityProductId: string
): Promise<CustomProductRow> {
  const supabase = await createClient();

  const source = await getCommunityProduct(communityProductId);
  if (!source) {
    throw new CommunityAdoptError("Community product not found or not published.", "not_found");
  }

  const { data, error } = await supabase
    .from("custom_products")
    .insert({
      user_id: userId,
      name: source.name,
      carrier_name: source.carrier_name,
      carrier_product_name: source.carrier_product_name,
      category: source.category,
      archetype: source.archetype,
      engine_preset: source.engine_preset,
      modifier_flags: source.modifier_flags,
      config: source.config,
      source: "adopted_from_community",
      community_product_id: source.id,
    })
    .select()
    .single();

  if (error) {
    if (
      error.message.includes("duplicate key") ||
      error.message.includes("custom_products_user_name_unique")
    ) {
      throw new CommunityAdoptError(
        `You already have a product named "${source.name}" in My Products.`,
        "duplicate_name"
      );
    }
    throw new Error(`adoptCommunityProduct: ${error.message}`);
  }
  return data as CustomProductRow;
}
