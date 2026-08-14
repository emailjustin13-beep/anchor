# Anchor production release checklist

Use this checklist only after the release candidate passes GitHub Actions. Do not copy secret values into an issue, pull request, chat, screenshot, or browser console.

## 1. Resolve legacy project ownership

The release-hardening migration refuses to run while any project has a null `owner_id`.

1. In Supabase, open **Table Editor → projects** and filter `owner_id` with **is null**.
2. Confirm whether each row belongs to the authenticated Anchor owner or should be archived.
3. Export any project that will be archived before deleting or moving it.
4. Assign only confirmed projects to the intended Supabase user ID.
5. Confirm that the null-owner count is zero.
6. Run `supabase/migrations/20260814040230_release_hardening.sql` in **SQL Editor**.
7. Open **Advisor Center → Security** and confirm the Anchor function warnings are gone.

Never infer ownership from the fact that only one user currently exists.

## 2. Verify Vercel environment scopes

In Vercel, open **Justin's Space's Projects → anchor → Settings → Environment Variables**.

| Variable | Production | Preview | Browser-visible |
|---|---:|---:|---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Required | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Required | Yes |
| `ANTHROPIC_API_KEY` | Required | Required for protected feature previews | No |
| `ANTHROPIC_MODEL` | Optional | Optional | No |
| `ANTHROPIC_DRAFT_SCAN_MODEL` | Optional | Optional | No |
| `ANTHROPIC_FALLBACK_MODEL` | Optional | Optional | No |

Confirm only the names and scopes. Do not reveal their values. No Anthropic variable may begin with `NEXT_PUBLIC_`.

## 3. Assign the production domain

1. In Vercel, open **anchor → Settings → Domains**.
2. Choose the canonical public production origin.
3. Confirm it points to the production deployment and does not require Vercel authentication.
4. Keep feature-branch previews protected.

## 4. Configure Supabase and Google redirects

1. In Supabase, open **Anchor → Authentication → URL Configuration**.
2. Set **Site URL** to the exact canonical production origin from step 3.
3. Add the exact production origin to **Redirect URLs**.
4. Keep the protected Vercel preview pattern only for feature testing.
5. Open **Authentication → Sign In / Providers → Google** and confirm Google is enabled.
6. Copy the Supabase callback URL shown there.
7. In Google Cloud, open **APIs & Services → Credentials → Anchor OAuth 2.0 Client → Authorized redirect URIs** and confirm that exact Supabase callback URL is present.

## 5. Promote only the tested commit

1. Record the PR head commit that passed **Anchor CI**.
2. Merge or promote that exact commit.
3. In Vercel, confirm the production deployment metadata shows the same commit.
4. Confirm the production deployment is **Ready** before moving to authentication tests.

## 6. Run clean-device and two-user verification

Use a browser or device that is not signed into Vercel.

1. Open the canonical production origin and complete Google sign-in.
2. Confirm the session returns to the same production origin.
3. With two separate test users, create one private project per user.
4. Confirm each user sees only their own project.
5. For each user, edit and autosave a screenplay, create a named version, and run one explicit AI scan.
6. Refresh both sessions and confirm the correct project, screenplay, version, and scan review remain isolated.
7. Sign user A out, sign user B into the same browser, and confirm user A's active project is not restored.

The release is complete only when all six sections pass against the same production deployment.
