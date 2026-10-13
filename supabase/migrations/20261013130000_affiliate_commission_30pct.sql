-- Standard referral commission goes from 25% to 30%.
--
-- The rate is stored per code at enrollment (affiliate_codes.commission_pct,
-- mirrored on affiliates.commission_pct), so changing the default in
-- lib/affiliates/stripe-coupon.ts only affects NEW enrollments. This moves
-- every existing 20%-discount code — and its affiliate — from 25 to 30.
-- Only rows still at the old default are touched, so any hand-negotiated
-- rate is left alone. No commissions had been earned when this shipped.

update affiliate_codes
set commission_pct = 30
where discount_pct = 20 and commission_pct = 25;

update affiliates a
set commission_pct = 30
where a.commission_pct = 25
  and exists (
    select 1 from affiliate_codes c
    where c.affiliate_id = a.id and c.discount_pct = 20 and c.commission_pct = 30
  );
