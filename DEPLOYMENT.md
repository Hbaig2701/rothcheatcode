# Deployment Workflow

## Environments

| Environment | Branch | URL | Database | Stripe |
|------------|--------|-----|----------|--------|
| **Production** | `main` | https://retirementexpert.ai | Production Supabase | Live Keys |
| **Preview/Staging** | Any feature branch | `branch-name.vercel.app` | Staging Supabase | Test Keys |
| **Development** | Local | localhost:3000 | Staging Supabase | Test Keys |

## Development Workflow

### 1. Starting New Work

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Create a feature branch
git checkout -b feature/descriptive-name
# or fix/bug-description
# or refactor/what-youre-refactoring
```

### 2. Making Changes

```bash
# Work on your changes locally
# Test locally (uses staging DB)

# Commit your work
git add .
git commit -m "Descriptive commit message"

# Push to GitHub
git push origin feature/descriptive-name
```

### 3. Testing on Preview

- Vercel automatically creates a preview deployment
- Check the deployment URL (Vercel will comment on PR)
- Preview uses **staging database** and **test Stripe**
- Test thoroughly - this is your safety net!

### 4. Creating a Pull Request

```bash
# Or use GitHub UI
gh pr create --title "Add cool feature" --body "Description of changes"
```

- Vercel runs checks
- Preview deployment is created
- Review changes yourself
- Test on the preview URL
- Merge when ready

### 5. Deploying to Production

```bash
# Once PR is approved and merged
git checkout main
git pull origin main
```

- Vercel auto-deploys to production
- Monitor https://retirementexpert.ai
- Check Vercel logs if issues arise

## Emergency Hotfix Process

If production is broken and you need to fix ASAP:

```bash
# Create hotfix branch from main
git checkout main
git checkout -b hotfix/critical-bug

# Make the minimal fix
# Test locally

# Push and create PR
git push origin hotfix/critical-bug
gh pr create --title "HOTFIX: Critical bug" --body "Description"

# Merge immediately after preview verification
```

## Rollback Process

If you need to revert a deployment:

1. Go to Vercel Dashboard → Deployments
2. Find the last working deployment
3. Click "..." → **Promote to Production**
4. Fix the issue in a new branch
5. Re-deploy the fix

## Testing Checklist Before Merging

- [ ] Preview deployment builds successfully
- [ ] Test key user flows on preview URL
- [ ] Check Vercel deployment logs for errors
- [ ] Verify database migrations (if any)
- [ ] Check that new features work as expected
- [ ] Verify Stripe integration (if touched)

## Common Issues

### Preview Using Production DB

- Check Vercel environment variables
- Preview should use staging Supabase URL
- Production should use production Supabase URL

### Stripe Test Mode Not Working in Preview

- Verify preview uses test Stripe keys
- Check webhook endpoint is set to `.vercel.app` domain

### Database Schema Out of Sync

- Run migrations on staging first
- Test on preview deployment
- Then run on production after merge

## Monitoring Production

After deployment, check:
- Vercel deployment logs
- Supabase logs (Database → Logs)
- Stripe dashboard (for payment issues)
- Test a few key user flows manually

## Best Practices

1. **Never commit directly to main** - always use PRs
2. **Test on preview URL before merging** - catch issues early
3. **Keep preview deployments small** - easier to debug
4. **Write descriptive commit messages** - helps future debugging
5. **Monitor after deployment** - catch issues immediately
6. **Use staging for risky changes** - test payment flows, migrations, etc.

---

**Remember:** Preview deployments are free on Vercel. Use them liberally!
