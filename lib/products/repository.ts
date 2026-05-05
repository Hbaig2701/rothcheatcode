/**
 * Custom Products repository — DB access for AI Builder products.
 * RLS scopes everything to auth.uid(), but we also pass user_id explicitly for clarity.
 */

import { createClient } from "@/lib/supabase/server";
import { ARCHETYPE_TO_ENGINE_PRESET, type CustomProductRow } from "./types";
import type { CreateCustomProductBody, UpdateCustomProductBody } from "./validators";

export async function listCustomProducts(userId: string): Promise<CustomProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_products")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("is_favorite", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(`listCustomProducts: ${error.message}`);
  return (data ?? []) as CustomProductRow[];
}

export async function getCustomProduct(userId: string, productId: string): Promise<CustomProductRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_products")
    .select("*")
    .eq("user_id", userId)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(`getCustomProduct: ${error.message}`);
  return (data as CustomProductRow | null) ?? null;
}

export async function createCustomProduct(
  userId: string,
  input: CreateCustomProductBody
): Promise<CustomProductRow> {
  const supabase = await createClient();

  const enginePreset = input.engine_preset ?? ARCHETYPE_TO_ENGINE_PRESET[input.archetype];

  const { data, error } = await supabase
    .from("custom_products")
    .insert({
      user_id: userId,
      name: input.name,
      carrier_name: input.carrier_name ?? null,
      carrier_product_name: input.carrier_product_name ?? null,
      category: input.category,
      archetype: input.archetype,
      engine_preset: enginePreset,
      modifier_flags: input.modifier_flags ?? [],
      config: input.config,
      source: input.source ?? "manual",
      ai_research_sources: input.ai_research_sources ?? null,
      ai_warnings: input.ai_warnings ?? null,
      ai_unsupported_features: input.ai_unsupported_features ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createCustomProduct: ${error.message}`);
  return data as CustomProductRow;
}

export async function updateCustomProduct(
  userId: string,
  productId: string,
  input: UpdateCustomProductBody
): Promise<CustomProductRow> {
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.carrier_name !== undefined) updates.carrier_name = input.carrier_name;
  if (input.carrier_product_name !== undefined) updates.carrier_product_name = input.carrier_product_name;
  if (input.archetype !== undefined) {
    updates.archetype = input.archetype;
    if (input.engine_preset === undefined) {
      updates.engine_preset = ARCHETYPE_TO_ENGINE_PRESET[input.archetype];
    }
  }
  if (input.engine_preset !== undefined) updates.engine_preset = input.engine_preset;
  if (input.modifier_flags !== undefined) updates.modifier_flags = input.modifier_flags;
  if (input.config !== undefined) updates.config = input.config;
  if (input.source !== undefined) updates.source = input.source;
  if (input.ai_research_sources !== undefined) updates.ai_research_sources = input.ai_research_sources;
  if (input.ai_warnings !== undefined) updates.ai_warnings = input.ai_warnings;
  if (input.ai_unsupported_features !== undefined) updates.ai_unsupported_features = input.ai_unsupported_features;
  if (input.is_favorite !== undefined) updates.is_favorite = input.is_favorite;
  if (input.is_archived !== undefined) updates.is_archived = input.is_archived;

  const { data, error } = await supabase
    .from("custom_products")
    .update(updates)
    .eq("user_id", userId)
    .eq("id", productId)
    .select()
    .single();

  if (error) throw new Error(`updateCustomProduct: ${error.message}`);
  return data as CustomProductRow;
}

export async function deleteCustomProduct(userId: string, productId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("custom_products")
    .delete()
    .eq("user_id", userId)
    .eq("id", productId);

  if (error) throw new Error(`deleteCustomProduct: ${error.message}`);
}

export async function countClientsUsingCustomProduct(userId: string, productId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("custom_product_id", productId);

  if (error) throw new Error(`countClientsUsingCustomProduct: ${error.message}`);
  return count ?? 0;
}
