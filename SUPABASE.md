# Supabase Setup — Current Server-Verified Architecture

**Source of truth:** the application code and migrations on `main`. This guide describes the repository's current server-verified game flow; it does not certify which migrations or Edge Function versions are currently deployed to any Supabase project.

## Environment variables

The checked-in `.env.example` lists the only frontend build variables required by the current application:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

- `VITE_SUPABASE_URL`: URL of the Supabase project used by that build.
- `VITE_SUPABASE_ANON_KEY`: public anon/publishable key for that project. It is expected to be visible in the browser.
- Never put a service-role key, database password, payment secret or other privileged credential in a `VITE_` variable, frontend source, or committed file.

For local work, use the repository's ignored local environment files (for example, `.env.local` for production configuration and `.env.staging.local` for staging configuration, where present). Keep them out of Git and do not paste their contents into issues, pull requests or chat. Confirm which file Vite loads for the command being run before starting the app or build.

In Cloudflare Pages, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` separately for **Preview** and **Production**. These are build-time public values; changing them requires a new deployment.

## Supabase project selection and migrations

**Always verify the target project before any CLI command that can change remote state.** A locally linked Supabase project can point to production or staging.

From the repository root:

```bash
npx supabase link --project-ref <INTENDED_PROJECT_REF>
npx supabase migration list --linked
```

Check the project reference shown in the Supabase Dashboard before linking. Review the local/remote migration lists and resolve any discrepancy deliberately. Do not blindly rerun SQL, use `db reset` against a linked remote project, or edit a migration that has already been applied.

The repository's migration sequence is:

1. `supabase/migrations/001_initial_schema.sql` — initial profiles and scores schema.
2. `supabase/migrations/002_server_verified_games.sql` — server-created game runs, replay verification, verified scores and server-owned player progression.
3. `supabase/migrations/003_full_move_game_completion.sql` — rules version 2, full move-allowance completion semantics, updated score bounds and Perfect Strategist award eligibility.

`supabase/schema.sql` is a schema snapshot corresponding to the initial schema; do not apply it separately and then also apply migration 001. For a fresh project, apply the migrations in numerical order using the documented Supabase CLI workflow. For an existing project, inspect migration history first and apply only migrations that are genuinely pending, using the staging project before production. Migration 003 must not be edited or reapplied to a project where it is already recorded as applied.

The migration work preserves historical score rows and marks pre-verification scores as unverified; they must not be presented as verified leaderboard results. Do not import browser-local XP or achievements into authoritative server progression.

## Edge Functions

The repository contains two Edge Function entry points:

- `start-game`: authenticates the caller, derives the player ID from the verified token, and creates a server-owned game run with its seed/configuration.
- `submit-game`: authenticates the caller, validates the run and move transcript using the shared verifier, and finalizes the result through the database's atomic finalizer.

After linking and confirming the intended project, inspect the deployed function list in the Supabase Dashboard or CLI before deciding whether a deployment is needed. To deploy intentionally:

```bash
npx supabase functions deploy start-game
npx supabase functions deploy submit-game
```

Supabase Edge Functions use server-side project configuration and privileged credentials. Keep service-role credentials in Supabase-managed function secrets only. Never print, commit, expose or put them in frontend environment variables. Check that required secret *names* are configured without displaying secret values.

## Cloudflare Pages deployment configuration

The existing Pages project uses:

- Root directory: repository root
- Install command: `npm ci`
- Build command: `npm run build`
- Build output directory: `dist`

The `public/_redirects` file provides the SPA fallback for direct navigation and refresh on application routes.

A push or merge to `main` triggers the configured Pages production deployment. Feature branches/PRs use Preview deployments when enabled. A successful GitHub merge is not, by itself, proof that the Pages deployment completed: check the deployment status and commit SHA in Cloudflare Pages.

## Safe deployment checklist

Use this sequence for backend or frontend releases:

1. Confirm the intended environment (staging or production) and project reference.
2. Confirm local branch and working tree; fetch the latest `main` before creating a feature branch.
3. Review migration history with `npx supabase migration list --linked` and inspect deployed Edge Function versions before backend changes.
4. Run `npm test` and `npm run build`.
5. Deploy and test staging first: a new game run, valid submission, duplicate submission, invalid transcript rejection, progression refresh and leaderboard visibility.
6. Confirm Cloudflare Preview deployment for frontend changes.
7. Production database changes and production deployments require explicit approval. After approval, deploy the exact reviewed commit and verify the Cloudflare deployment status and commit SHA.
8. Never clear production data as part of routine testing. Use staging for destructive test setup.

Do not assume a migration or function is deployed because its source exists on `main`. Record the actual remote migration and function state before backend work. Do not include secret values in deployment notes.

## Current trust and data model

- Auth identity is taken from the verified Supabase access token, not a client-supplied user ID.
- Game runs are created server-side with a seed, rules version, RNG version and expiry.
- The server replays the submitted move transcript against the versioned rules.
- The database finalizer consumes a run once, inserts a verified score and updates XP/progression/achievement awards atomically.
- Duplicate finalization is handled idempotently.
- Leaderboards include verified scores only.
- Existing pre-migration scores are preserved as unverified.
- Profiles, player progress and achievement awards are protected by RLS; sensitive writes use trusted server-side operations.

Replay verification establishes that a transcript is legal under the current rules. It does not prove a human played or provide complete bot prevention.

## Account recovery limitation

Anonymous Supabase identity is persisted in the browser. Clearing browser storage can make an unlinked anonymous account inaccessible. Optional account linking is planned and must preserve the existing Auth user ID and associated data.

## Cost and operational notes

Supabase and Cloudflare free tiers can support early validation, but free tiers are subject to quotas, inactivity and backup/availability limitations. Monitor usage and plan an upgrade when production uptime, recovery or traffic requirements justify it.
