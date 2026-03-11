# Staging Environment Setup Checklist

Complete these steps to set up proper staging/production separation.

## Part 1: Supabase Staging Project

- [ ] **1.1** - Go to https://supabase.com/dashboard
- [ ] **1.2** - Click "New Project"
- [ ] **1.3** - Create project:
  - Name: `retirement-expert-staging`
  - Password: (save in password manager)
  - Region: US West (same as production)
  - Plan: Free tier
- [ ] **1.4** - Wait ~2 minutes for project to be ready
- [ ] **1.5** - Copy project reference ID (from URL or Settings)
- [ ] **1.6** - Copy schema from production to staging:

**Option A: Using Supabase CLI (Recommended)**
```bash
# Install CLI
brew install supabase/tap/supabase

# Link to production
supabase link --project-ref usyhxfqooahvsmttyrel

# Pull schema
supabase db pull

# Link to staging
supabase link --project-ref YOUR_STAGING_PROJECT_REF

# Push schema to staging
supabase db push
```

**Option B: Manual Copy**
- Go to production Supabase → SQL Editor
- Run: `pg_dump` or copy each migration file
- Paste into staging SQL Editor

- [ ] **1.7** - Verify tables exist in staging (check `clients` table)

## Part 2: Get Staging Credentials

- [ ] **2.1** - In staging project, go to Settings → API
- [ ] **2.2** - Copy and save these:
  - [ ] Project URL: `https://_____.supabase.co`
  - [ ] Anon key: `eyJh...`
  - [ ] Service role key: `eyJh...`

## Part 3: Configure Vercel Environment Variables

- [ ] **3.1** - Go to https://vercel.com → your project
- [ ] **3.2** - Click Settings → Environment Variables
- [ ] **3.3** - For each existing variable, click Edit:

### NEXT_PUBLIC_SUPABASE_URL
- [ ] Edit the existing one:
  - Keep Production value (production URL)
  - **UNCHECK** Preview and Development
- [ ] Add NEW variable:
  - Name: `NEXT_PUBLIC_SUPABASE_URL`
  - Value: `<staging-url>`
  - Environments: **Preview** and **Development** only

### NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] Edit the existing one:
  - Keep Production value (production key)
  - **UNCHECK** Preview and Development
- [ ] Add NEW variable:
  - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Value: `<staging-anon-key>`
  - Environments: **Preview** and **Development** only

### SUPABASE_SERVICE_ROLE_KEY
- [ ] Edit the existing one:
  - Keep Production value (production key)
  - **UNCHECK** Preview and Development
- [ ] Add NEW variable:
  - Name: `SUPABASE_SERVICE_ROLE_KEY`
  - Value: `<staging-service-key>`
  - Environments: **Preview** and **Development** only

### Stripe Variables (if you have them)
- [ ] Do the same for Stripe keys:
  - Production: Use LIVE keys
  - Preview/Development: Use TEST keys

### Other Environment Variables
- [ ] Check for any other env vars and split appropriately

## Part 4: Update Local Development Environment

- [ ] **4.1** - Update your `.env.local`:
```bash
# Replace with STAGING credentials
NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-staging-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-staging-service-role-key
```

- [ ] **4.2** - Test locally:
```bash
npm run dev
# Verify it connects to staging DB (create a test client)
```

## Part 5: GitHub Branch Protection

- [ ] **5.1** - Go to GitHub → Your repo → Settings
- [ ] **5.2** - Click Branches (left sidebar)
- [ ] **5.3** - Click "Add rule"
- [ ] **5.4** - Configure:
  - Branch name pattern: `main`
  - ✅ Require a pull request before merging
  - ✅ Require approvals: 0 (or 1 if you want to review your own PRs)
  - ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - ✅ Include administrators (forces YOU to use PRs too)
- [ ] **5.5** - Click "Create"

## Part 6: Test the Workflow

- [ ] **6.1** - Create a test feature branch:
```bash
git checkout main
git pull
git checkout -b test/staging-setup
```

- [ ] **6.2** - Make a small change (e.g., add a comment somewhere)
```bash
# Edit a file
git add .
git commit -m "test: verify staging environment"
git push origin test/staging-setup
```

- [ ] **6.3** - Create a PR on GitHub
- [ ] **6.4** - Wait for Vercel to deploy preview
- [ ] **6.5** - Check the preview URL (Vercel comments on PR)
- [ ] **6.6** - Verify preview uses staging DB (check Supabase logs)
- [ ] **6.7** - Merge the PR
- [ ] **6.8** - Verify production deployment works

## Part 7: Document and Clean Up

- [ ] **7.1** - Add notes to CLAUDE.md if needed
- [ ] **7.2** - Update README with deployment workflow
- [ ] **7.3** - Delete test branch:
```bash
git checkout main
git pull
git branch -d test/staging-setup
```

## Verification Checklist

After setup, verify:

- [ ] Local development uses staging DB
- [ ] Preview deployments use staging DB
- [ ] Production uses production DB
- [ ] Can't push directly to main (branch protection works)
- [ ] Preview deployments work correctly
- [ ] Production deployment still works

## Rollback Plan

If something breaks:

1. Vercel → Deployments → Find last working deployment → Promote to Production
2. Revert environment variable changes in Vercel if needed
3. Fix the issue in a new branch
4. Re-deploy

---

**Time estimate:** 30-45 minutes total

**Cost:**
- Staging Supabase: Free tier
- Vercel Preview deployments: Free (included in all plans)
- Total: $0/month

**When you're done, you'll have:**
- Safe testing environment
- Protection against breaking production
- Professional deployment workflow
- Peace of mind with real users
