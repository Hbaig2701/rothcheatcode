/**
 * Promote an existing advisor custom product into the Community Products catalog.
 *
 * This is the authoring path for the platform-curated catalog: you build (or an
 * advisor builds) a product once in My Products, then promote it so every advisor
 * can adopt a copy. Copy-on-promote — editing the original afterward does not
 * change the catalog entry.
 *
 * Usage:
 *   npx tsx scripts/promote-to-community.ts <owner-email> "<product name>" [--description "blurb"] [--draft]
 *
 * Flags:
 *   --description "..."  Optional catalog blurb shown to advisors.
 *   --draft              Create unpublished (is_published=false); advisors won't see it
 *                        until you flip is_published. Default is published.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const email = args[0];
const productName = args[1];

function flagValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const description = flagValue("--description") ?? null;
const isPublished = !args.includes("--draft");

if (!email || !productName) {
  console.error(
    'Usage: npx tsx scripts/promote-to-community.ts <owner-email> "<product name>" [--description "blurb"] [--draft]'
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const { data: src, error: srcErr } = await admin
    .from("custom_products")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", productName)
    .maybeSingle();

  if (srcErr) {
    console.error("Lookup failed:", srcErr.message);
    process.exit(1);
  }
  if (!src) {
    console.error(`No product named "${productName}" found in ${email}'s My Products.`);
    process.exit(1);
  }

  const row = {
    name: src.name,
    description,
    carrier_name: src.carrier_name,
    carrier_product_name: src.carrier_product_name,
    category: src.category,
    archetype: src.archetype,
    engine_preset: src.engine_preset,
    modifier_flags: src.modifier_flags,
    config: src.config,
    source_custom_product_id: src.id,
    created_by: user.id,
    is_published: isPublished,
  };

  // Upsert on the catalog's unique name so re-running refreshes the entry.
  const { data: existing } = await admin
    .from("community_products")
    .select("id")
    .eq("name", src.name)
    .maybeSingle();

  if (existing) {
    const { data: updated, error: updErr } = await admin
      .from("community_products")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();
    if (updErr) {
      console.error("Update failed:", updErr.message);
      process.exit(1);
    }
    console.log(
      `Updated Community product "${updated.name}" (id: ${updated.id}, published: ${updated.is_published}).`
    );
    process.exit(0);
  }

  const { data: created, error: insErr } = await admin
    .from("community_products")
    .insert(row)
    .select()
    .single();

  if (insErr) {
    console.error("Insert failed:", insErr.message);
    process.exit(1);
  }
  console.log(
    `Promoted "${created.name}" to Community Products (id: ${created.id}, published: ${created.is_published}).`
  );
  process.exit(0);
})();
