# Anchor

Anchor is a non-generative screenplay integrity tool. It helps a writer maintain a confirmed story bible, inspect relationship history, and pressure-test new pages without writing the story for them.

## Prototype scope

- Story Bible with characters, relationship snapshots, and character life state
- Ties That Bind with chronological, evidence-backed relationship events
- Standard screenplay editor with eight element types, smart keyboard flow, scene navigation, search/replace, autocomplete, title pages, and local recovery
- FDX import/export, TXT export, print-to-PDF, Supabase autosave, and named version history
- Manual **Scan Scene**, **Scan Draft**, and selection-based **Pressure Test**
- First Read review flow: characters → relationships → timeline → writer confirmation
- Passwordless Supabase Auth, owner-scoped row-level security, and server-only Anthropic credentials
- JSON-schema-validated AI responses

Essay/source-citation support and a visual redesign are intentionally deferred.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the three required values.
2. For a new Supabase project, run `supabase-schema.sql` in its SQL Editor.
3. For the existing Anchor database, run `supabase-migration-core-prototype.sql` first. The migration is safe to rerun after an editor update. Then sign in and create a test project. Legacy projects remain private and hidden until you run the optional owner-claim statement at the bottom of that file.
4. Install and start:

```bash
npm ci
npm test
npm run dev
```

The Anthropic key must be configured only as `ANTHROPIC_API_KEY` on the server or hosting platform. Never expose it with a `NEXT_PUBLIC_` prefix.

## Verification

```bash
npm test
npm run build
npm audit --omit=dev
```

The regression suite enforces both the secure-core promises and the screenplay-editor contract: standard elements and keyboard flow, file interchange, recovery/version history, navigation, search, autocomplete, and mobile light editing.
