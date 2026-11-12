# Grid Rivals engagement report

This report uses the game-run records already collected by Grid Rivals. It adds **no tracking SDK, client events, database tables, migrations, or new personal-data collection**.

Run these read-only queries in the Supabase SQL Editor for the production project. They use UTC calendar days so results are consistent regardless of a player's device timezone.

## What the metrics mean

- **Game starts:** rows in `public.grid_rivals_game_runs`, grouped by `started_at`.
- **Completed games:** runs with `consumed_at IS NOT NULL`. A run is consumed when its verified result is finalized.
- **Completion rate:** completed runs divided by started runs in the same start-date cohort. This is a cohort-based rate; very recent runs may not yet have finished.
- **Active players:** distinct anonymous Supabase user IDs with at least one game start that day.
- **D1 retention:** a new player's first-ever game-start date plus one UTC calendar day contains another game start. D1 is reported only after the following UTC calendar day has fully ended.
- **D7 retention:** a new player's first-ever game-start date plus seven UTC calendar days contains another game start. D7 is reported only after the seventh following UTC calendar day has fully ended.

Retention is exact-day calendar retention, not “any time within the following 24 hours” or “any time during days 1–7”. Immature cohorts show `NULL` for the relevant retention fields rather than a misleading zero.

## 1. Daily engagement — last 30 UTC days

```sql
with daily as (
  select
    (started_at at time zone 'UTC')::date as report_date,
    count(*) as games_started,
    count(*) filter (where consumed_at is not null) as games_completed,
    count(*) filter (
      where game_mode = 'daily' and consumed_at is not null
    ) as daily_challenges_completed,
    count(distinct user_id) as active_players
  from public.grid_rivals_game_runs
  where started_at >= now() - interval '30 days'
  group by 1
)
select
  report_date,
  active_players,
  games_started,
  games_completed,
  round(100.0 * games_completed / nullif(games_started, 0), 1)
    as completion_rate_pct,
  daily_challenges_completed
from daily
order by report_date desc;
```

## 2. New-player D1 and D7 retention — recent cohorts

A player enters a cohort on the UTC date of their first recorded game start. The query does not expose player IDs.

```sql
with first_play as (
  select
    user_id,
    min((started_at at time zone 'UTC')::date) as cohort_date
  from public.grid_rivals_game_runs
  group by user_id
),
activity as (
  select distinct
    user_id,
    (started_at at time zone 'UTC')::date as activity_date
  from public.grid_rivals_game_runs
),
cohort_activity as (
  select
    first_play.user_id,
    first_play.cohort_date,
    bool_or(activity.activity_date = first_play.cohort_date + 1) as returned_d1,
    bool_or(activity.activity_date = first_play.cohort_date + 7) as returned_d7
  from first_play
  left join activity
    on activity.user_id = first_play.user_id
   and activity.activity_date in (
     first_play.cohort_date + 1,
     first_play.cohort_date + 7
   )
  where first_play.cohort_date >=
    (now() at time zone 'UTC')::date - 30
  group by first_play.user_id, first_play.cohort_date
)
select
  cohort_date,
  count(*) as new_players,
  case
    when cohort_date <= (now() at time zone 'UTC')::date - 2
    then count(*) filter (where returned_d1)
  end as players_returned_d1,
  case
    when cohort_date <= (now() at time zone 'UTC')::date - 2
    then round(
      100.0 * count(*) filter (where returned_d1) / nullif(count(*), 0), 1
    )
  end as d1_retention_pct,
  case
    when cohort_date <= (now() at time zone 'UTC')::date - 8
    then count(*) filter (where returned_d7)
  end as players_returned_d7,
  case
    when cohort_date <= (now() at time zone 'UTC')::date - 8
    then round(
      100.0 * count(*) filter (where returned_d7) / nullif(count(*), 0), 1
    )
  end as d7_retention_pct
from cohort_activity
group by cohort_date
order by cohort_date desc;
```

## 3. Game-mode mix — last 30 UTC days

```sql
select
  game_mode,
  count(*) as games_started,
  count(*) filter (where consumed_at is not null) as games_completed,
  count(distinct user_id) as players,
  round(
    100.0 * count(*) filter (where consumed_at is not null)
      / nullif(count(*), 0),
    1
  ) as completion_rate_pct
from public.grid_rivals_game_runs
where started_at >= now() - interval '30 days'
group by game_mode
order by games_started desc;
```

## Interpretation and limitations

- Anonymous Supabase user IDs are used only inside aggregate queries. Do not export raw IDs or attempt to identify players.
- These records represent players who successfully obtained a server-created game run. They do not count page visits where a visitor never starts a game.
- An unconsumed run is **not proof of abandonment**: it may still be in progress, expired, or interrupted.
- D1/D7 retention is based on a return game start, not merely opening the website.
- Anonymous identity is device/browser-session dependent. Clearing browser storage or changing devices may create a new anonymous identity, so retention can be understated.
- The date boundaries are UTC. This keeps reporting reproducible but may differ from a player's local calendar day.
- The report contains no device-category breakdown because the existing server records do not reliably capture that information. Do not infer mobile versus desktop.
- These are operational engagement metrics, not a substitute for a privacy notice or legal review. Review the applicable privacy requirements before adding analytics, advertising, or payments.

## Suggested review cadence

Review the report weekly once there is enough real traffic to make the numbers meaningful. Look first for trends in completed games, D1/D7 retention, and daily-mode participation. Avoid setting monetisation targets until there is a stable baseline.
