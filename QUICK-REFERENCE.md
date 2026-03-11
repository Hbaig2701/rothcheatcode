# Quick Reference - Daily Workflow

## Starting New Feature

```bash
git checkout main
git pull
git checkout -b feature/my-feature
# Make changes...
git add .
git commit -m "Add my feature"
git push origin feature/my-feature
# Create PR on GitHub
# Test on preview URL
# Merge when ready
```

## Environment Mapping

| You're working in... | Database | Stripe | URL |
|---------------------|----------|--------|-----|
| **Local (npm run dev)** | Staging | Test | localhost:3000 |
| **Preview (feature branch)** | Staging | Test | feature-name.vercel.app |
| **Production (main branch)** | Production | Live | retirementexpert.ai |

## Key Principle

**NEVER touch production data directly!**
- Test everything on preview first
- Preview = staging DB = safe to break
- Only merge to main when preview looks good

## Common Commands

```bash
# See current branch
git branch

# Switch to main
git checkout main

# Update from GitHub
git pull

# Create new branch
git checkout -b feature/name

# See what changed
git status
git diff

# Commit changes
git add .
git commit -m "Description"

# Push to GitHub (creates preview)
git push origin feature/name

# Create PR
gh pr create

# After merge, clean up
git checkout main
git pull
git branch -d feature/name
```

## When Things Go Wrong

**Preview deployment failed?**
- Check Vercel logs in the deployment
- Check build errors in terminal
- Fix and push again

**Production is broken?**
- Go to Vercel → Deployments
- Find last working deployment
- Click "..." → Promote to Production
- Fix in new branch, test on preview, re-deploy

**Can't push to main?**
- This is by design! Create a PR instead
- Branch protection is protecting you

## Quick Checks Before Merging

1. ✅ Preview builds successfully
2. ✅ Test key features on preview URL
3. ✅ No errors in Vercel logs
4. ✅ Changes look good

## URLs to Bookmark

- Production: https://retirementexpert.ai
- Vercel Dashboard: https://vercel.com
- Supabase Production: https://usyhxfqooahvsmttyrel.supabase.co
- Supabase Staging: (you'll get this after setup)
- GitHub Repo: https://github.com/[your-username]/rothcheatcode

---

**Pro tip:** Keep this file open while you work!
