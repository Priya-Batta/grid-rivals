# Grid Rivals — Player Data Ownership Audit

**Audited baseline:** `main` at commit `527c4adef9d1f5171e0ecdc03d75274e9b7465aa` (PR #5 merge)  
**Date:** 7 November 2026  
**Scope:** Browser storage, local progression writes, Supabase player data contracts and the next safe refactoring sequence  
**Change type:** Documentation only; no runtime, schema, migration, secret or production changes

## 1. Executive finding

Grid Rivals already has server-authoritative records for verified scores, XP, levels, aggregate player progress and achievement awards. However, the frontend still maintains a second, independent progression model in browser storage.

This creates a split source of truth:
- The server awards XP and achievements only when a verified game run is successfully finalized.
- The client awards local XP and achievements during moves and when a game ends, before server verification is necessarily successful.
- The menu level bar and Achievements screen currently read the local profile, while the leaderboard can show server-derived level information.

The next implementation work should converge the UI on server-owned progression without importing client-controlled legacy XP or deleting browser data prematurely.

## 2. Browser storage inventory

A repository-wide search found no application use of `sessionStorage`. The application uses the following explicit `localStorage` keys:

| Key | Current read/write locations | Current purpose | Target ownership |
|---|---|---|---|
| `grid-rivals-sound` | `src/main.ts` | Sound on/off preference | Browser preference; keep local |
| `grid-rivals-display-name` | `src/leaderboard.ts`, `src/leaderboard-ui.ts` | Cached display name; can be written offline | Supabase profile; local cache only |
| `grid-rivals-profile` | `src/achievements.ts`, called from `src/main.ts` | Entire local XP, level, achievement unlock and progress profile | Supabase progress/awards; retire as an authority after UI migration |
| `grid-rivals-best-Easy` | `src/main.ts`, `src/screens/player-screens.ts`, `src/achievements.ts` | Device-local Easy best score | Server score history/summary for verified play; optional local practice cache |
| `grid-rivals-best-Medium` | Same as above | Device-local Medium best score | Same |
| `grid-rivals-best-Hard` | Same as above | Device-local Hard best score | Same |
| `grid-rivals-daily-best` | `src/main.ts`, `src/achievements.ts` | Device-local Daily best score | Server score history/summary for verified Daily play; optional local practice cache |
| `grid-rivals-daily-total` | `src/main.ts`, `src/screens/player-screens.ts`, `src/achievements.ts` | Device-local Daily completion count | Server daily progress for verified Daily runs |
| `grid-rivals-daily-streak` | `src/main.ts`, `src/screens/player-screens.ts`, `src/achievements.ts` | Device-local Daily streak | Server daily progress for verified Daily runs |
| `grid-rivals-last-daily` | `src/main.ts` | Device-local last completed Daily date, used to calculate streak | Server `last_daily_date` for verified Daily runs |

Supabase JS is also configured with `auth.persistSession: true`. The SDK persists its anonymous authentication session in browser storage using its generated project-specific storage key. This is SDK-managed identity state, not an application-defined key; it must not be cleared as part of the progression refactor.

### Important behaviour behind these keys

- `src/achievements.ts` loads, normalizes, mutates and persists `grid-rivals-profile`.
- `recordTileClaim()` increments local claimed-tile progress and evaluates/unlocks achievements after every accepted move.
- `recordGameCompletion()` increments local completed/won counts, local best score and Daily progress, awards local game XP and achievement XP, then persists the profile.
- `src/main.ts` calls those local progression functions independently of the server finalization response. The game can therefore update local progression even if verified submission later fails or the game was local practice.
- Local best-score keys are updated at game completion and are also passed to the leaderboard UI as local bests. They are not equivalent to verified leaderboard scores.
- The Statistics screen currently reads local bests and Daily counters directly.
- The menu level bar and Achievements screen use the local `Profile` object.
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

Frontend service contracts currently exposed by `src/leaderboard.ts` include:
- `ensurePlayerProfile()`: calls `ensure_grid_rivals_profile_v2` and returns user ID, display name and player level.
- `startVerifiedGame()`: calls `start-game` and validates the server-created run configuration.
- `submitVerifiedGame()`: calls `submit-game` with the move transcript.
- `fetchLeaderboard()`: calls `get_grid_rivals_leaderboard`.
- `fetchPlayerSummary()`: calls `get_grid_rivals_player_summary` and returns best score, rank and player level.
- `updatePlayerDisplayName()`: calls `update_grid_rivals_display_name`.

A successful submission returns verified result data including score, status, move counts, total XP and player level. The current UI displays the returned server XP/level in the result screen, but it does not replace the local profile with that result.

The achievement-award table has an authenticated read policy for the player's own awards, but the current frontend does not fetch those awards for the Achievements screen.

## 4. Gaps and risks to resolve

### P0 — Conflicting progression authorities

The local profile is not a safe authority for XP, levels or achievement unlocks. Local progress can include practice games, individual moves from an unfinished/unverified run, and a game whose server submission has failed. The server correctly awards progression only during verified finalization.

**Required outcome:** UI progression and achievement unlocks must be derived from server data. Client state may cache/display that data but must not grant it.

### P0 — The server response is not yet a complete UI profile

The current profile and summary calls expose display name, best score, rank and level. The UI also needs aggregate progress and the player's achievement awards. The current progress table does not contain a dedicated `games_won` or per-difficulty best-score field; do not assume those values exist server-side.

**Required outcome:** define a read contract for aggregate progress and achievement awards, and decide whether any missing statistic is genuinely required before adding schema.

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

1. **Define read contracts:** add typed frontend models for player progress and achievement awards; use existing server tables/RLS where sufficient. Confirm missing metrics before proposing schema.
2. **Add server read service:** fetch the authenticated player's progress and own awards; handle loading, offline and unavailable states without inventing zero progress.
3. **Switch presentation:** update menu level bar and Achievements screen to consume server-backed data. Refresh after successful verified submission. Keep local profile untouched temporarily for rollback/compatibility.
4. **Separate local practice stats:** clearly distinguish verified server scores from device-only practice bests; decide whether Statistics needs a redesign.
5. **Retire local progression writes:** only after the UI no longer depends on them and regression tests cover verified, practice, offline, refresh and duplicate-submit cases. Do not delete old keys in the same change.
6. **Fix display-name sync direction:** server wins on initialization; only an explicit edit can change the canonical name.
7. **Remove obsolete local profile code and keys:** a later, separate cleanup after a compatibility window and explicit acceptance of the data-retirement behaviour.

## 7. Explicit non-actions in this audit

- No browser storage was read or changed for any player.
- No legacy XP, scores, streaks or achievements were imported into Supabase.
- No database schema, migration, RLS policy or Edge Function was changed.
- No secrets, environment values or production configuration were accessed.
- No production deployment was triggered.

## 8. Acceptance criteria for the next implementation PR

- It introduces a typed, read-only server progress/achievement contract.
- It does not change score verification, game rules, XP award calculation or database schema unless separately reviewed and approved.
- It does not clear or migrate any browser storage.
- It handles offline/loading/error states explicitly.
- Tests cover valid server data, empty progress, missing configuration and failed reads.
- Existing routes, game completion and leaderboard behaviour remain unchanged.
