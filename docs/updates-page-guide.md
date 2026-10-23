# Publishing to the Updates page

The in-app changelog advisors read at `/updates`. Entries live in
`app/(dashboard)/updates/updates-list.tsx`.

This guide is the instruction set for the weekly routine that drafts entries, and
for anyone doing it by hand. It is in git on purpose: when the rules change, they
change here rather than inside a scheduler config nobody can find.

## The one rule that matters

**Notable features only. Never publish a bug fix, and never imply anything was
broken.**

Advisors read this page. A changelog full of fixes reads as an unstable product,
and "we fixed the tax calculation" invites the question of what else is wrong.
Fixes ship silently; features get announced.

## What qualifies

Include a `feat()` commit when an advisor can **see, click, or benefit from** it.

Exclude, always:

- every `fix()`, `chore()`, `docs()`, `test()`, and internal refactor
- engine work with no visible surface (a cache-version bump, a new audit suite)
- anything not wired to a UI an advisor can actually reach — a prototype that
  reached `main` is not shippable news, and announcing it advertises something
  nobody can open
- product config and seeding work, unless it's "new carrier products available",
  which is worth one combined entry

Two judgement calls that come up often:

- **A commit that bundles a feature with a fix** — describe only the feature.
  The Sept 29 Inputs tray commit also fixed a contrast problem; the entry
  mentions only the tray.
- **Two commits that are one story to an advisor** — write ONE entry. The
  advisory fee and the Roth-converted AUM allocation shipped separately but read
  as a single idea ("convert to a Roth and keep managing it"), so they are one
  entry, not two overlapping ones.

## Format

One `updates` array, **newest first**, ids are descending strings. Order comes
from array position, not from the date or id, but keep all three consistent.

```ts
{
  id: '54',
  date: 'October 14, 2026',
  title: 'Enter an Exact Date of Birth',
  description: "First paragraph.\n\nSecond paragraph.",
  category: 'New Feature',   // or 'Enhancement'. Never 'Bug Fix'.
  icon: CalendarDays,        // lucide-react
}
```

`icon` must also be added to the `lucide-react` import at the top of the file, or
the build fails.

`category` is `'New Feature'` for something new, `'Enhancement'` for something
existing getting better. (`'Announcement'`, `'Feature'` and `'Bug Fix'` appear in
old entries; don't add more.)

## Formatting trap

Descriptions render through `whitespace-pre-wrap` with **no markdown parser** —
the component interpolates the raw string. So:

- **No `**bold**` and no `#` headings.** They print as literal characters.
- Paragraph breaks are `\n\n`. They render correctly.
- A leading `*` prints a literal asterisk, which is used deliberately as a
  bullet in a few entries. Fine when you want a bullet, wrong by accident.
- Escape inner double quotes (`\"`).

## Voice

Benefit-first and advisor-facing. Say what they can now do, then where to click
("Settings → Business"). One concrete number beats an adjective.

Avoid: version numbers, file names, table or column names, "we", "fixed",
"improved", and anything that reads like a commit message. The reader is an
advisor mid-case, not an engineer.

Say plainly when existing behaviour is untouched — "Small is the size reports
have always used, so nothing changes unless you choose otherwise" — because an
advisor's first worry about any change is whether their saved work moved.

## Process

1. Read the top entry's `date` to see how current the page is.
2. `git log --date=short --format='%ad %h %s' --since='<that date>'`
3. Filter per the rules above. Check the existing entries so you don't repeat
   something already published.
4. Add entries above the current top one, continuing the id sequence.
5. `npx tsc --noEmit` and `npm run build` — a missing icon import only shows up
   at build time.
6. Commit to a **branch**, open a PR, then **squash-merge it yourself** once
   `tsc` passes and the diff touches only `updates-list.tsx`. Hamza wants the
   page published every week without waiting on a review (changed Oct 23,
   2026, after three weekly PRs sat unmerged). Never push to `main` directly —
   the PR is the record of what went out. If an older `updates/weekly-*` PR is
   still open, close it if its entries are already on `main`.
7. If nothing qualifies, stop. Do not open an empty PR, and do not pad the page
   with fixes to make the week look productive.
