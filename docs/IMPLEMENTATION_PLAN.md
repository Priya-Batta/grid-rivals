# Grid Rivals — Implementation Plan

**Branch:** `improve/ui-performance-pass`  
**Release rule:** No production merge/deploy without explicit approval.  
**Database rule:** No production schema or data changes without explicit approval.

## Working method

- One small, reviewable change at a time.
- Fetch current branch files before editing.
- Keep existing game behaviour and routes working.
- Run tests and production build after meaningful code changes.
- Prefer additive migrations and preserve all existing player data.
- Ask before any change that requires production secrets, billing, live database access or store accounts.

## Phase 0 — Architecture baseline and documentation

- [x] Review current frontend, package scripts, Supabase schema/migration and Edge Function design.
- [x] Write the target HLD.
- [ ] Reconcile Supabase setup documentation with server-verified game flow.
- [ ] Record current environment variables and deployment procedure without exposing secrets.
- [ ] Confirm the actual deployed migration/function versions before any backend work.

**Exit criteria:** documentation accurately describes the code currently in the feature branch; no code or database behaviour changed.

## Phase 1 — Reliability and code boundaries

1. Inventory every localStorage/sessionStorage key and every local progression write.
2. Identify the exact frontend/server data contracts for profile, progress, achievements, scores and leaderboard.
3. Define a typed API/service boundary without changing behaviour.
4. Move pure game rules into a neutral shared module; preserve deterministic replay and version compatibility.
5. Split the game entry point into focused modules in small steps.
6. Make server data authoritative in the UI; retain local preferences and safe caches.
7. Add tests for account initialization, refresh/navigation, duplicate submissions, offline behaviour and progression rendering.

**Exit criteria:** existing gameplay, routes, leaderboard, verified submissions and player progression continue to work; local data cannot grant authoritative XP or entitlements.

## Phase 2 — Identity, recovery and mobile web

1. Design account linking that preserves the anonymous Supabase user ID.
2. Implement and test account linking only after the migration/recovery path is agreed.
3. Improve responsive layouts, touch targets, safe areas and orientation.
4. Add PWA manifest and icons.
5. Add static asset caching; never treat cached client state as a verified result.
6. Test install, update and recovery flows on real Android/iOS browsers.

**Exit criteria:** player identity survives supported account-linking/recovery flows and the web game is comfortable on common mobile screens.

## Phase 3 — Audience validation

1. Add privacy-conscious analytics with consent and data minimisation.
2. Measure game completion, daily challenge usage and D1/D7 retention.
3. Improve onboarding and sharing based on measured friction.
4. Establish a minimum engagement threshold before ad or purchase integration.

**Exit criteria:** there is evidence of repeat usage and a reason to introduce monetisation.

## Phase 4 — Monetisation foundations

1. Select providers based on audience geography, expected volume, privacy requirements and platform rules.
2. Define server-side entitlement and purchase verification contracts.
3. Add idempotent transaction storage and refund/revocation handling.
4. Add cosmetic inventory and catalogue only when the first items are ready.
5. Introduce optional rewarded ads with explicit user choice and frequency caps.
6. Add ad-free/cosmetic purchases; keep competitive outcomes unchanged.

**Exit criteria:** test purchases can be verified, restored and revoked safely; no client-side purchase flag can grant benefits.

## Phase 5 — Native distribution

1. Evaluate Capacitor once mobile usage justifies it.
2. Add Android/iOS platform projects and store billing adapters.
3. Implement platform-specific privacy disclosures, consent, age and store compliance.
4. Test on physical devices and staged releases.
5. Launch one platform first if resources are limited; expand only after operational readiness.

## Phase 6 — Scale when metrics require it

- Review database query plans and indexes.
- Add leaderboard pagination/caching where measured.
- Add safe retention/cleanup jobs for expired game runs and old operational records.
- Set budget/quota alerts and incident procedures.
- Upgrade Supabase/Cloudflare plans when limits or uptime requirements justify it.
- Consider additional infrastructure only after identifying a specific bottleneck.

## Explicitly out of scope for the first refactor

- Replacing Phaser, Supabase or Cloudflare.
- Microservices, Kubernetes or Redis.
- Native apps before mobile demand is demonstrated.
- Real-money tournaments, paid competitive advantages or pay-to-win items.
- Production database migrations without separate approval.

## Definition of done for each change

- Scope is limited and documented.
- Tests pass.
- `npm run build` passes.
- No secrets are committed.
- Existing player data and game behaviour are preserved.
- Feature branch only; production remains untouched.
