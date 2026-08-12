# Anchor

Anchor is a non-generative screenplay integrity tool. It helps a writer maintain a confirmed story bible, inspect relationship history, and pressure-test new pages without writing the story for them.

## Prototype scope

- Story Bible with characters, relationship snapshots, and character life state
- Ties That Bind with chronological, evidence-backed relationship events
- Screenplay editor with manual **Scan Scene**, **Scan Draft**, and selection-based **Pressure Test**
- First Read review flow: characters → relationships → timeline → writer confirmation
- Passwordless Supabase Auth, owner-scoped row-level security, and server-only Anthropic credentials
- JSON-schema-validated AI responses

Essay/source-citation support and a visual redesign are intentionally deferred.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the three required values.
2. For a new Supabase project, run `supabase-schema.sql` in its SQL Editor.
3. For the existing Anchor database, deploy the app, sign in once, replace the email placeholder in `supabase-migration-core-prototype.sql`, and run that migration in one transaction.
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

The four regression tests enforce the core prototype promises: writer-triggered AI, server-side credentials with authentication, structured evidence-backed outputs, and owner-scoped chronological records.
