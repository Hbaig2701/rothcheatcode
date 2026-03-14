# Payment Wall Activation Guide

**Created:** March 14, 2026
**Scheduled Activation:** Sunday, March 16, 2026
**Status:** ✅ Code ready, currently DISABLED

---

## What This Does

Blocks access for **12 grandfathered users** who don't have actual Stripe subscriptions.

When activated, they'll see a full-screen overlay that says:
- "Your Trial Has Ended"
- "Subscribe now to regain access..."
- Button: "Subscribe Now" → takes them to Stripe checkout

**Who is affected:**
- ✅ 12 free/grandfathered users (9 active, 3 inactive)
- ❌ NOT the 2 paying users (they continue normally)
- ❌ NOT admins (never blocked)

---

## How to Activate on Sunday

### Step 1: Edit the Layout File

Open: `app/(dashboard)/layout.tsx`

Find this line (around line 118):
```typescript
<PaymentWallModal enabled={false} />
```

Change to:
```typescript
<PaymentWallModal enabled={true} />
```

### Step 2: Deploy

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: activate payment wall for grandfathered users"
git push
```

Vercel will auto-deploy in ~30 seconds.

### Step 3: Verify

1. Test with a grandfathered user account (not admin, not paying)
2. They should see the blocking modal immediately
3. "Subscribe Now" button should work

---

## How It Works

**Detection Logic:**
- Checks for `stripe_customer_id` or `stripe_subscription_id`
- If missing → user is grandfathered → show block
- If present → user is paying → allow access

**The Modal:**
- Full-screen overlay (blocks entire app)
- User can't close it or navigate
- Only way out: subscribe or sign out
- Personalized checkout link with their email pre-filled

**Code Location:**
- Modal component: `/components/payment-wall-modal.tsx`
- Integration: `/app/(dashboard)/layout.tsx`

---

## Affected Users (as of March 14, 2026)

### Active Users (9) - Have Created Clients
1. jordanvogan@gmail.com - 1 client
2. nicoleconnors.gfi@gmail.com - 2 clients
3. resmail@wegotyourfin.com - 2 clients
4. markb@4mylegacy.com - 1 client
5. marco@ampretirement.com - 2 clients
6. support@hexonasystems.com - 1 client
7. cclubb@1roadfinancial.com - 2 clients
8. damsler@secure1fs.com - 1 client
9. garrett@vroommediagroup.com - 1 client

### Inactive Users (3) - No Clients Created
1. bradypelzer@exclusiveannuities.com
2. bbeaty@assetismarketing.com
3. sunny.mrkajic@equitrust.com

---

## Rollback Plan

If you need to disable after activation:

```typescript
<PaymentWallModal enabled={false} />
```

Then commit and push. Takes 30 seconds to deploy.

---

## Testing Before Go-Live

**DO NOT test on production** - it will block real users.

To test locally:
1. Set `enabled={true}` in your local copy
2. Run `npm run dev`
3. Sign in as a non-paying user
4. Should see the modal

Remember to set back to `false` before committing!

---

## Questions?

The payment wall is a client-side component that:
- Loads on every page in the dashboard
- Checks subscription status on mount
- Shows blocking overlay if no Stripe subscription
- Generates personalized checkout links

No database changes needed - uses existing subscription data.
