# Supabase Setup — Current Server-Verified Architecture

This document describes the current server-verified implementation on the `improve/ui-performance-pass` branch. It supersedes the older client-submitted score instructions.

## Required project configuration

1. Create or use the existing Supabase project.
2. Enable **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
3. Configure the local and deployed application URLs in Supabase Auth settings where required.
4. For local development, copy `.env.example` to `.env` and configure the public frontend values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

These values are public browser configuration. Never put a Supabase service-role key in a `VITE_` variable or frontend source.

## Database setup

The repository has a base schema and an additive server-verification migration:

1. Review and apply `supabase/schema.sql` to a fresh project.
2. Apply `supabase/migrations/002_server_verified_games.sql` after the base schema.
3. For an existing project, inspect the migration history first. Do not blindly rerun SQL or apply the migration a second time.
4. Preserve existing profiles and scores. The migration marks pre-existing scores as unverified; they remain stored but are excluded from the verified leaderboard.
5. The migration initializes server-owned progress at level 1 / 0 XP rather than trusting legacy client-controlled XP.

Use the Supabase CLI migration workflow for future migrations. Keep the checked-in schema and migration history aligned; do not edit an already-applied migration to change a live database.

## Edge Functions

Deploy both functions from the repository:

- `start-game`: validates the caller's access token, derives the user ID from Auth, creates a server-owned run and returns its seed/configuration.
- `submit-game`: validates the caller, checks the run and submitted move transcript using the shared verifier, and invokes the atomic finalizer.

Deploy with the Supabase CLI from the repository root after linking the intended project:

```bash
supabase functions deploy start-game
supabase functions deploy submit-game
```

The functions require the project's Supabase URL and service-role secret in the server-side Edge Function environment. The service-role secret must never be exposed to the browser, committed to Git, or copied into a `VITE_` variable. Use the Supabase project's managed secrets and verify the exact function configuration before deployment.

## Cloudflare Pages

For the existing Pages project:

- Root directory: repository root
- Build command: `npm run build`
- Build output directory: `dist`
- Install command: `npm ci`

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in both Preview and Production build environments. These are public build-time values. A new build is required after changing them.

The `public/_redirects` SPA fallback supports direct navigation and refresh on application routes.

## Current trust and data model

- Auth identity is taken from the verified Supabase access token, not a client-supplied user ID.
- Game runs are created server-side with a seed, rules version, RNG version and expiry.
- The server replays the submitted move transcript against the versioned rules.
- The database finalizer consumes a run once, inserts a verified score and updates XP/progression/achievement awards atomically.
- Duplicate finalization is handled idempotently.
- Leaderboards include verified scores only.
- Existing pre-migration scores are preserved with `is_verified = false`.
- Profiles, player progress and achievement awards are protected by RLS; sensitive writes use trusted server-side operations.

Replay verification establishes that a transcript is legal under the current rules. It does not prove a human played or provide complete bot prevention.

## Account recovery limitation

Anonymous Supabase identity is persisted in the browser. Clearing browser storage can make an unlinked anonymous account inaccessible. Optional account linking is a planned improvement and must preserve the existing Auth user ID and associated data.

## Verification before production deployment

1. Confirm the intended Supabase project reference.
2. Confirm migration history and deployed Edge Function versions.
3. Confirm required function secrets exist without printing their values.
4. Run `npm test` and `npm run build`.
5. Test a new run, a valid submission, duplicate submission, invalid transcript and leaderboard visibility in a non-production environment.
6. Deploy to Preview/staging first.
7. Production deployment requires explicit approval.

## Cost and operational notes

Supabase and Cloudflare free tiers can support early validation, but free tiers are subject to quotas, inactivity and backup/availability limitations. Monitor usage and plan an upgrade when production uptime, recovery or traffic requirements justify it.
