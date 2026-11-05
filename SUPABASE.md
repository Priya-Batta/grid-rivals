# Supabase Leaderboard Setup

The game needs a Supabase project to publish global results. No project URL or key is included in this repository. Until configured, gameplay and existing local best scores continue to work; finished scores are kept in a local retry queue.

## Supabase project

1. Create a Supabase project on the Free plan.
2. In **Authentication > Sign In / Providers**, enable **Anonymous Sign-Ins**. Anonymous users receive a persisted auth session in this browser without registering an account.
3. Open **SQL Editor**, paste and run the complete [`supabase/schema.sql`](supabase/schema.sql) script. It creates the profile and score tables, indexes, RLS policies, and RPC functions.
4. In **Project Settings > API**, copy the Project URL and the public anon/publishable key. Never use a `service_role` or secret key in this frontend.
5. Add the local and production app URLs under the Supabase Auth URL configuration where applicable, including `http://localhost:5173` and `https://grid-rivals.pages.dev`.

## Environment variables

For local development, copy `.env.example` to `.env` and set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Both values are public browser configuration; database security comes from anonymous auth, RLS, and the narrowly scoped RPC functions. Do not put a service-role key in any `VITE_` variable. Restart Vite after changing `.env`.

## Cloudflare Pages deployment

1. Open the existing `grid-rivals` Pages project in Cloudflare.
2. Under **Settings > Builds & deployments**, use the repository root as the root directory, `npm run build` as the build command, and `dist` as the output directory. The install step is `npm ci`.
3. Under **Settings > Environment variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to both Production and Preview environments. These are build-time variables because Vite embeds public configuration in the generated app.
4. Save the settings and trigger a new deployment. The existing production URL remains `https://grid-rivals.pages.dev`.
5. Open the deployed app, enter the Global Leaderboard, and confirm an anonymous profile is created. Finish a game to test score submission.

For a manual deployment, run `npm ci`, set the two variables in that shell environment, run `npm run build`, then deploy the resulting `dist` directory using the Cloudflare Pages dashboard or Wrangler.

## Data and trust model

- A score is submitted only from the completed-game flow. Leaving a game early does not submit it.
- The client creates a stable UUID per game. The database unique constraint on `(user_id, game_id)` makes retries idempotent.
- Submission derives `user_id` from the authenticated Supabase session. Direct table writes are not granted; writes go through the security-definer RPC, which validates score bounds, game mode, level, and submission rate.
- Leaderboard RPCs return at most 100 players, one best score per player for the selected period and difficulty. `Today` uses UTC midnight; `This Week` is the rolling last seven days.
- The score and level originate in a browser game. These checks reduce accidental and trivial abuse but do not make client-submitted scores cheat-proof. A trusted server-side game or replay-verification system would be needed for that.
- Display names are limited to 3-20 basic Latin letters, digits, spaces, `_` and `-`, with a small profanity blocklist. Scores and display names are visible to other authenticated leaderboard participants.
- Anonymous identity is tied to the browser's persisted Supabase session. Clearing browser storage can lose access to that anonymous profile.
- Failed/offline submissions remain in local storage and are retried when connectivity returns or when the player presses **Retry Saved Scores**. Existing local personal bests remain unchanged.
