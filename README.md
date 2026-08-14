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
- Google-first Supabase Auth with email fallback and owner-scoped row-level security
- Server-only Anthropic requests with rate limits, retry handling, deadlines, size limits, and structured responses

AI runs only after an explicit writer action. Nothing proposed by AI becomes canon until the writer confirms it.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the three required values.
2. For a new Supabase project, run `supabase-schema.sql` in its SQL Editor.
3. For the existing Anchor database, run `supabase-migration-core-prototype.sql`. The migration is safe to rerun. Legacy projects remain private and hidden until the optional owner-claim statement at the bottom of that file is deliberately completed.
4. In Supabase **Authentication → Sign In / Providers → Google**, copy the callback URL. Add it to a Google OAuth Web client, then configure and enable Google inside Supabase.
5. In Supabase **Authentication → URL Configuration**, add every deployed application URL. Vercel preview builds use `https://*-justins-space-s-projects.vercel.app/**`.
6. Install and start:

```bash
npm ci
npm test
npm run dev
```

`ANTHROPIC_API_KEY` and every optional Anthropic model override must remain server-only. Never give them a `NEXT_PUBLIC_` prefix.

## Verification

```bash
npm test
npm run build
npm audit --omit=dev
```

The suite currently contains 31 regression tests covering explicit AI execution, private data access, screenplay editing, file interchange, recovery, evidence navigation, Story Memory, issue reconciliation, Case 02, and release configuration. GitHub Actions runs the tests and production build on pushes and pull requests.

Production should only be promoted from the exact commit that passed CI. After assigning a production domain, add it to Supabase Auth and verify Google sign-in and owner isolation on a device that is not signed into Vercel.
