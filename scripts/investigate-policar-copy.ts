import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const IDS = ["0c658494-76ff-4765-9733-1d50a1e0a7d1", "689a6e80-c359-4310-988b-f1e2a988cb7b"];

(async () => {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const all = users?.users ?? [];

  console.log("=== IDENTITIES OF THE TWO ACCOUNTS HOLDING POLICAR CLIENTS ===");
  for (const id of IDS) {
    const u = all.find((x) => x.id === id);
    const { data: prof } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
    console.log(`\nuser_id=${id}`);
    console.log(`  auth.email=${u?.email}`);
    console.log(`  auth.metadata=${JSON.stringify(u?.user_metadata)}`);
    console.log(`  profile=${JSON.stringify(prof)}`);
  }

  console.log("\n=== ANY USER/ PROFILE MATCHING greg / stoope / stoop ===");
  for (const u of all) {
    const hay = `${u.email} ${JSON.stringify(u.user_metadata)}`.toLowerCase();
    if (/greg|stoop/.test(hay)) console.log(`  AUTH id=${u.id} email=${u.email} meta=${JSON.stringify(u.user_metadata)}`);
  }
  const { data: profs } = await admin.from("profiles").select("id,email,full_name");
  for (const p of profs ?? []) {
    const hay = `${p.email} ${p.full_name}`.toLowerCase();
    if (/greg|stoop/.test(hay)) console.log(`  PROFILE id=${p.id} email=${p.email} name=${p.full_name}`);
  }
})();
