-- Account-backed storage for year-by-year table column preferences.
--
-- Previously these lived ONLY in browser localStorage (lib/table-columns/storage.ts),
-- which silently lost preferences on Safari (ITP deletes script-written storage
-- after 7 days), across devices/browsers, and on any cache clear. Advisors saw
-- their saved/favourite columns "revert" (Kwanza Ellis ticket, Jun 2026).
--
-- localStorage is kept as a same-device instant cache; THIS table is the durable
-- per-account source of truth, reconciled on load.
--
-- One row per (user, scope_key):
--   • per-client layout  -> scope_key = 'year-by-year-<clientId>'
--   • user "favourite"   -> scope_key = 'user_default_growth' | 'user_default_gi'
create table if not exists public.column_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  selected_columns jsonb not null default '[]'::jsonb,
  column_widths jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, scope_key)
);

create index if not exists column_preferences_user_id_idx
  on public.column_preferences (user_id);

alter table public.column_preferences enable row level security;

create policy "Users can view own column preferences"
  on public.column_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own column preferences"
  on public.column_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own column preferences"
  on public.column_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own column preferences"
  on public.column_preferences for delete
  using (auth.uid() = user_id);
