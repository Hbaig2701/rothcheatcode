-- Affiliate payouts via Stripe Connect.
--
-- Until now an affiliate's "annual commission" was an estimate
-- (active subscribers × discounted list price × commission %), and payouts
-- were meant to be sent by hand over PayPal. Nothing recorded what each
-- referral actually paid, what was refunded, or what had been paid out.
--
-- This adds:
--   * affiliates.stripe_account_id / payouts_enabled — the advisor's Stripe
--     Express account that commissions are transferred to.
--   * affiliate_commissions — a signed ledger. One +row per paid invoice from
--     a referred customer, one −row per refund / dispute against it. A row is
--     payable once available_at has passed (30-day hold on commissions,
--     reversals are immediate) and it isn't attached to a payout yet.
--   * affiliate_payouts — one row per monthly transfer to an affiliate.
--   * claim_affiliate_payout() — atomically gathers an affiliate's payable
--     rows into a new payout when they total at least the minimum.

alter table affiliates
  add column if not exists stripe_account_id text,
  add column if not exists payouts_enabled boolean not null default false;

create unique index if not exists affiliates_stripe_account_id_key
  on affiliates (stripe_account_id)
  where stripe_account_id is not null;

create table if not exists affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  -- processing: rows claimed, transfer not yet confirmed
  -- paid:       Stripe transfer created
  -- failed:     transfer rejected; its rows were released back to the pool
  status text not null default 'processing'
    check (status in ('processing', 'paid', 'failed')),
  stripe_transfer_id text unique,
  error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists affiliate_payouts_affiliate_idx
  on affiliate_payouts (affiliate_id, created_at desc);

create table if not exists affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references affiliates(id) on delete restrict,
  customer_profile_id uuid references profiles(id) on delete set null,
  -- commission:  +25% of a paid invoice
  -- refund:      −share of a refund against that invoice
  -- dispute:     −share of a chargeback against that invoice
  -- dispute_won: +reinstates a dispute reversal when we win the dispute
  kind text not null
    check (kind in ('commission', 'refund', 'dispute', 'dispute_won')),
  -- Stripe object that produced the row (invoice / refund / dispute id).
  -- Unique per kind so webhook retries can't double-count.
  source_id text not null,
  stripe_invoice_id text not null,
  stripe_customer_id text,
  -- What the customer paid on the invoice (incl. tax) and the pre-tax amount
  -- the commission was computed on. Kept on every row so reversals can be
  -- pro-rated against the original commission.
  paid_amount_cents bigint not null,
  base_amount_cents bigint not null,
  commission_pct numeric not null,
  amount_cents bigint not null,
  available_at timestamptz not null,
  payout_id uuid references affiliate_payouts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, source_id)
);

create index if not exists affiliate_commissions_unpaid_idx
  on affiliate_commissions (affiliate_id, available_at)
  where payout_id is null;

create index if not exists affiliate_commissions_invoice_idx
  on affiliate_commissions (stripe_invoice_id);

-- Server-only tables: RLS on with no policies, so only the service role
-- (API routes, webhook, cron) can read or write them.
alter table affiliate_commissions enable row level security;
alter table affiliate_payouts enable row level security;

-- Gather every payable row for one affiliate into a new 'processing' payout,
-- if they net to at least _min_cents. Locks the affiliate row so two
-- overlapping cron runs can't claim the same rows. Returns no row when
-- there's nothing to pay (or the total is under the minimum, in which case
-- the balance simply carries to next month).
create or replace function claim_affiliate_payout(_affiliate_id uuid, _min_cents bigint)
returns table (payout_id uuid, amount_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _total bigint;
  _payout uuid;
begin
  perform 1 from affiliates where id = _affiliate_id for update;

  -- Don't open a second payout while one is still unresolved.
  if exists (
    select 1 from affiliate_payouts p
    where p.affiliate_id = _affiliate_id and p.status = 'processing'
  ) then
    return;
  end if;

  select coalesce(sum(c.amount_cents), 0) into _total
  from affiliate_commissions c
  where c.affiliate_id = _affiliate_id
    and c.payout_id is null
    and c.available_at <= now();

  if _total < _min_cents then
    return;
  end if;

  insert into affiliate_payouts (affiliate_id, amount_cents)
  values (_affiliate_id, _total)
  returning id into _payout;

  update affiliate_commissions c
  set payout_id = _payout
  where c.affiliate_id = _affiliate_id
    and c.payout_id is null
    and c.available_at <= now();

  return query select _payout, _total;
end;
$$;

revoke all on function claim_affiliate_payout(uuid, bigint) from public, anon, authenticated;
