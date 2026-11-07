# Grid Rivals — Player Data Ownership Audit

**Audited baseline:** `main` at commit `527c4adef9d1f5171e0ecdc03d75274e9b7465aa` (PR #5 merge)  
**Date:** 7 November 2026  
**Scope:** Browser storage, local progression writes, Supabase player data contracts and the next safe refactoring sequence  
**Change type:** Documentation only; no runtime, schema, migration, secret or production changes

## 1. Executive finding

Grid Rivals uses Supabase as the authority for verified scores, XP, levels, aggregate player progress and achievement awards. The menu level bar and Achievements screen now read a server-backed profile; client code no longer grants progression or persists a competing local profile.

The remaining separation is intentional: best scores and Daily counters shown on the Statistics screen are still device-local and may include practice or unverified play. They must remain clearly distinguished from verified server records. The legacy `grid-rivals-profile` key is retained untouched and is not imported.

## 2. Browser storage inventory

A repository-wide search found no application use of `sessionStorage`. The application uses the following explicit `localStorage` keys:

| Key | Current read/write locations | Current purpose | Target ownership |
|---|---|---|---|
| `grid-rivals-sound` | `src/main.ts` | Sound on/off preference | Browser preference; keep local |
| `grid-rivals-display-name` | `src/leaderboard.ts`, `src/leaderboard-ui.ts` | Cached display name; can be written offline | Supabase profile; local cache only |
| `grid-rivals-profile` | Legacy key; no longer read or written by the application after the server-backed progression cleanup | Historical local XP, level, achievement unlock and progress snapshot | Retain untouched for compatibility; do not treat as authoritative or delete as part of this refactor |
| `grid-rivals-best-Easy` | `src/main.ts`, `src/screens/player-screens.ts` | Device-local Easy best score | Server score history/summary for verified play; optional local practice cache |
| `grid-rivals-best-Medium` | Same as above | Device-local Medium best score | Same |
| `grid-rivals-best-Hard` | Same as above | Device-local Hard best score | Same |
| `grid-rivals-daily-best` | `src/main.ts` | Device-local Daily best score | Server score history/summary for verified Daily play; optional local practice cache |
| `grid-rivals-daily-total` | `src/main.ts`, `src/screens/player-screens.ts` | Device-local Daily completion count | Server daily progress for verified Daily runs |
| `grid-rivals-daily-streak` | `src/main.ts`, `src/screens/player-screens.ts` | Device-local Daily streak | Server daily progress for verified Daily runs |
| `grid-rivals-last-daily` | `src/main.ts` | Device-local last completed Daily date, used to calculate streak | Server `last_daily_date` for verified Daily runs |

Supabase JS is also configured with `auth.persistSession: true`. The SDK persists its anonymous authentication session in browser storage using its generated project-specific storage key. This is SDK-managed identity state, not an application-defined key; it must not be cleared as part of the progression refactor.

### Important behaviour behind these keys

- The menu level bar and Achievements screen consume a profile assembled from Supabase progress and the authenticated player's server-awarded achievements.
- `src/achievements.ts` now contains achievement definitions and pure display calculations only; it does not load, mutate or persist player progression.
- The legacy `grid-rivals-profile` key is intentionally left untouched. Its historical values are neither imported into server progress nor displayed as verified progression.
- A game played in local practice mode cannot grant server XP or achievement awards. Verified progression changes only after successful server finalization.
- Local best-score keys are updated at game completion and are also passed to the leaderboard UI as local bests. They are not equivalent to verified leaderboard scores.
- The Statistics screen currently reads local bests and Daily counters directly.
- The menu level bar and Achievements screen use the server-backed `Profile` view model returned by `fetchPlayerProgress()`.
- `recordDailyCompletion()` updates local Daily counters before the verified submission is known to have succeeded.
- `grid-rivals-display-name` is written locally for offline use. During profile initialization, a differing cached name can be sent back to Supabase, so a stale local cache can overwrite a newer server-side name.

## 3. Server-side data contract

The server-side schema and functions are defined in the Supabase migrations, principally `002_server_verified_games.sql` and the rules update in `003_full_move_game_completion.sql`.

| Server record | Relevant data | Authority and use |
|---|---|---|
| `grid_rivals_profiles` | Auth user ID, display name, mirrored player level | Canonical player identity/display name; level mirror |
| `grid_rivals_scores` | Verified score, game mode, difficulty, timestamp, verification flag and run association | Canonical competitive score history |
| `grid_rivals_game_runs` | Owner, mode, difficulty, seed, rules/RNG versions, expiry, consumption and score association | Canonical verified run lifecycle |
| `grid_rivals_player_progress` | Total XP, level, games completed, tiles claimed, best game score, Daily completions, current Daily streak, last Daily date | Canonical aggregate progression |
| `grid_rivals_achievement_awards` | Achievement ID, XP awarded, unlock timestamp | Canonical achievement awards |

Frontend service contracts exposed by `src/leaderboard.ts` include:
- `ensurePlayerProfile()`: calls `ensure_grid_rivals_profile_v2` and returns user ID, display name and player level.
- `startVerifiedGame()`: calls `start-game` and validates the server-created run configuration.
- `submitVerifiedGame()`: calls `submit-game` with the move transcript.
- `fetchLeaderboard()`: calls `get_grid_rivals_leaderboard`.
- `fetchPlayerSummary()`: calls `get_grid_rivals_player_summary` and returns best score, rank and player level.
- `fetchPlayerProgress()`: reads the authenticated player's aggregate progress and own achievement awards to build the UI profile.
- `updatePlayerDisplayName()`: calls `update_grid_rivals_display_name`.

A successful submission returns verified result data including score, status, move counts, total XP and player level. After successful finalization, the UI refreshes the server-backed progression profile. The menu level bar and Achievements screen use that refreshed profile; they do not use the legacy local profile.

The achievement-award table's authenticated read policy is used by the frontend to fetch the player's own awards.

## 4. Gaps and risks to resolve

### Resolved in the server-backed progression cleanup — Conflicting progression authorities

The menu level bar and Achievements screen now derive progression from Supabase. The client-side achievement module contains only definitions and pure display calculations; it no longer grants XP, unlocks achievements, or persists a local progression profile. The legacy `grid-rivals-profile` key is retained untouched and is not imported.

**Remaining boundary:** device-local best scores and Daily counters continue to support the explicitly device-local Statistics screen; they must not be presented as verified server progression.

### Resolved — Server-backed progression read model

The frontend now has a typed read contract and `fetchPlayerProgress()` service for the authenticated player's aggregate progress and achievement awards. The menu level bar and Achievements screen consume this server-backed profile, with explicit loading/unavailable handling. No schema change was needed for this cleanup.

The separate device-local Statistics screen remains a follow-up item; its best scores and Daily counters must not be described as verified server statistics.

### P1 — Legacy/local scores and Daily counters

Local bests and Daily counts may include practice or unverified sessions. They must not be imported as verified scores, XP or server achievement awards. Keep them readable during the transition so existing device history is not silently erased. Decide separately whether they remain labelled local/practice statistics or are retired after a compatibility period.

### P1 — Display-name cache direction

The server should be canonical. A local cached name should populate the form when offline, but should not automatically overwrite a different server value on profile initialization. Explicit user edits should update the server and then refresh the cache after success; offline edits need a clearly defined pending-sync policy.

### P1 — Daily streak semantics

The server increments Daily progress only when a verified Daily run is finalized, using the run's UTC date. The local counter is updated when the Daily game ends, regardless of verified submission success. The UI should use server Daily progress for competitive/achievement state.


### Resolved — Perfect Strategist award condition

The earlier audit finding above was stale: migration `003_full_move_game_completion.sql` already corrects the server-side award condition. It replaces the previous `p_moves_remaining > 0` predicate with:

```sql
p_final_status = 'won'
and p_moves_remaining = 0
and p_score >= 300
```

This matches the client eligibility rule and the achievement description (“Reach 300 points after using all moves.”). The server remains authoritative for awarding the achievement.

**Status:** Resolved in migration 003; that migration was previously confirmed applied to both staging and production. No additional migration, Edge Function deployment or runtime code change is required for this finding. Do not edit the already-applied migration.

## 5. Recommended target ownership

| Data | Source of truth | Permitted browser use |
|---|---|---|
| Auth identity/session | Supabase Auth | SDK-managed persistent session |
| Display name | `grid_rivals_profiles` | Cache/form draft only |
| Verified scores | `grid_rivals_scores` | Short-lived display cache |
| XP and level | `grid_rivals_player_progress` | Display/cache only |
| Achievement awards | `grid_rivals_achievement_awards` | Display/cache only |
| Aggregate verified progress | `grid_rivals_player_progress` | Display/cache only |
| Sound preference | Browser | Persistent local preference |
| Unverified/practice bests | Explicitly labelled device-local data, if retained | Local only; never represented as verified |
| In-progress board and animations | Active game session | In-memory; no persistence currently promised |

## 6. Safe implementation sequence

1. [x] **Define read contracts:** typed frontend models exist for player progress and achievement awards, using existing tables and RLS.
2. [x] **Add server read service:** fetches the authenticated player's progress and own awards, with explicit loading and unavailable states.
3. [x] **Switch presentation:** menu level bar and Achievements screen use server-backed data; progress refreshes after verified submission.
4. **Separate local practice stats:** clearly distinguish verified server scores from device-only practice bests; decide whether Statistics needs a redesign.
5. [x] **Retire local progression writers:** client-side XP grants, achievement unlock evaluation and local profile persistence are removed. The legacy key is retained untouched.
6. [x] **Fix display-name sync direction:** server wins on initialization; only an explicit edit can change the canonical name.
7. **Remove obsolete local profile key:** only after a compatibility window and explicit acceptance of the data-retirement behaviour; not part of this cleanup.

## 7. Explicit non-actions in this audit

- No browser storage was read or changed for any player.
- No legacy XP, scores, streaks or achievements were imported into Supabase.
- No database schema, migration, RLS policy or Edge Function was changed.
- No secrets, environment values or production configuration were accessed.
- No production deployment was triggered.

## 8. Verification notes for the server-backed progression cleanup

- [x] Typed, read-only server progress and achievement-award contracts use the existing tables and RLS.
- [x] The menu level bar and Achievements screen consume the server-backed profile.
- [x] Loading and unavailable states are represented explicitly by the read service/UI.
- [x] Client-side XP grants, achievement unlock evaluation and local profile persistence are removed.
- [x] The legacy `grid-rivals-profile` key and all other browser storage keys are left untouched.
- [x] No score-verification rules, game rules, XP award calculation, database schema, migrations, RLS policies or Edge Functions were changed.
- [x] Repository tests and production build passed on the PR branch.

The remaining follow-up is to distinguish device-local practice statistics from verified server statistics on the Statistics screen.
