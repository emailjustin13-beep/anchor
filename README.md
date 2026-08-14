# Anchor

> “We don’t write your story. We help you stay true to it.”

Anchor is a private screenplay studio with story-integrity intelligence. It remembers writer-confirmed facts, compares revisions against them, cites the exact conflicting passages, and asks whether a change is intentional. It never writes replacement story prose.

## Current build

**Editor 0.4.8, Inky Motion**

- Story Bible with confirmed characters, relationship snapshots, life state, and chronology
- Ties That Bind with evidence-backed relationship events
- Tiptap screenplay studio with eight standard elements and smart keyboard flow
- Scene navigation, search and replace, autocomplete, title pages, and local recovery
- FDX import and export, TXT export, print-to-PDF, Supabase autosave, and named versions
- First Read review flow: characters → relationships → timeline → writer confirmation
- Manual **Pressure Test**, **Scan Scene**, **Scan Draft**, and **X-Ray** tools
- Local Story Memory and an issue ledger with stable identity, dismissal, resolution, and reopening
- Permanent Automated Gauntlet fixtures with deterministic CI grading and opt-in live model evaluation
- Google-first Supabase Auth with email fallback and owner-scoped row-level security
- Private Supabase Storage with owner-scoped image policies and expiring signed URLs
- Server-only Anthropic requests with rate limits, retry handling, deadlines, size limits, and structured responses

AI runs only after an explicit writer action. Nothing proposed by AI becomes canon until the writer confirms it.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the three required values.
2. For a new Supabase project, run `supabase-schema.sql` in its SQL Editor.
3. For the existing Anchor database, run `supabase-migration-core-prototype.sql`. The migration is safe to rerun. Legacy projects remain private and hidden until their ownership is deliberately confirmed.
4. Resolve every legacy project with a null `owner_id`, then run `supabase/migrations/20260814040230_release_hardening.sql`. It refuses to apply while any project remains ownerless.
5. Follow `docs/production-release-checklist.md` for environment scopes, domain assignment, Auth redirects, deployment matching, and two-user release verification.
6. In Supabase **Authentication → Sign In / Providers → Google**, copy the callback URL. Add it to a Google OAuth Web client, then configure and enable Google inside Supabase.
7. In Supabase **Authentication → URL Configuration**, add every deployed application URL. Vercel preview builds use `https://*-justins-space-s-projects.vercel.app/**`.
8. Install and start:

```bash
npm ci
npm test
npm run dev
```

`ANTHROPIC_API_KEY` and every optional Anthropic model override must remain server-only. Never give them a `NEXT_PUBLIC_` prefix.

## Verification

```bash
npm test
npm run gauntlet -- --repeat 2
npm run build
npm audit --omit=dev
```

The suite currently contains 41 regression tests plus 10 permanent Gauntlet screenplays with 34 chronological revisions. Coverage includes explicit AI execution, private data access, private Storage URLs, database release hardening, screenplay editing, file interchange, recovery, evidence navigation, Story Memory, issue reconciliation, Case 02, false-positive suppression, fixed and branching time travel, personal chronology, model retry behavior, and release configuration. GitHub Actions runs the tests, the deterministic Gauntlet twice, and the production build on pushes and pull requests. See `docs/automated-gauntlet.md` for live model evaluation.

Production should only be promoted from the exact commit that passed CI. After assigning a production domain, add it to Supabase Auth and verify Google sign-in and owner isolation on a device that is not signed into Vercel.
