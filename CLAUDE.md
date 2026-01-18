# Claude Code Instructions

Project-specific rules for Claude Code when working on Rothc.

## Testing & Verification

**NEVER spin up localhost for testing.** Always:
1. Push changes to GitHub
2. Vercel auto-deploys from main branch
3. Test on production URL: https://rothc-lime.vercel.app

This ensures testing happens in the real environment with proper SSL, environment variables, and Supabase connectivity.

## Deployment

- **Hosting:** Vercel (auto-deploys from main)
- **Production URL:** https://rothc-lime.vercel.app
- **Database:** Supabase (eoudmavoifpxtvjmjfqi.supabase.co)
- **Branch:** main = production

## Checkpoints

When reaching verification checkpoints:
- Push code to trigger Vercel deploy
- Test on https://rothc-lime.vercel.app
- Wait for user confirmation before proceeding
