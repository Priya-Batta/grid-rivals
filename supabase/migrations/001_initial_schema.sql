create table if not exists public.grid_rivals_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  player_level integer not null default 1 check (player_level between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grid_rivals_display_name_format check (
    display_name ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$'
  ),
  constraint grid_rivals_display_name_language check (
    display_name !~* '(^|[^a-z])(fuck|shit|bitch|asshole|cunt)([^a-z]|$)'
  )
);

create table if not exists public.grid_rivals_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  score integer not null check (score >= 0),
  game_mode text not null check (game_mode in ('easy', 'medium', 'hard', 'daily')),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  achieved_at timestamptz not null default now(),
  constraint grid_rivals_daily_is_medium check (game_mode <> 'daily' or difficulty = 'medium'),
  constraint grid_rivals_unique_game_per_player unique (user_id, game_id)
);

create index if not exists grid_rivals_scores_leaderboard_idx
  on public.grid_rivals_scores (difficulty, score desc, achieved_at asc);
create index if not exists grid_rivals_scores_period_idx
  on public.grid_rivals_scores (achieved_at desc, difficulty, score desc);
create index if not exists grid_rivals_scores_player_idx
  on public.grid_rivals_scores (user_id, achieved_at desc);

alter table public.grid_rivals_profiles enable row level security;
alter table public.grid_rivals_scores enable row level security;

revoke all on table public.grid_rivals_profiles from anon, authenticated;
revoke all on table public.grid_rivals_scores from anon, authenticated;
grant select on table public.grid_rivals_profiles to authenticated;

drop policy if exists "authenticated users can read leaderboard profiles"
  on public.grid_rivals_profiles;
create policy "authenticated users can read leaderboard profiles"
  on public.grid_rivals_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "users can read their own profile"
  on public.grid_rivals_profiles;
create policy "users can read their own profile"
  on public.grid_rivals_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.ensure_grid_rivals_profile(p_player_level integer default 1)
returns table (user_id uuid, display_name text, player_level integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.grid_rivals_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Anonymous sign-in is required';
  end if;
  if p_player_level is null or p_player_level not between 1 and 10000 then
    raise exception 'Invalid player level';
  end if;

  insert into public.grid_rivals_profiles as current_profile (user_id, display_name, player_level)
  values (
    v_user_id,
    'RIVAL-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6)),
    p_player_level
  )
  on conflict on constraint grid_rivals_profiles_pkey do update
    set player_level = excluded.player_level,
        updated_at = now()
  returning current_profile.* into v_profile;

  return query select v_profile.user_id, v_profile.display_name, v_profile.player_level;
end;
$$;

create or replace function public.update_grid_rivals_display_name(p_display_name text)
returns table (user_id uuid, display_name text, player_level integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.grid_rivals_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Anonymous sign-in is required';
  end if;
  if p_display_name is null
    or p_display_name !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,19}$'
    or p_display_name ~* '(^|[^a-z])(fuck|shit|bitch|asshole|cunt)([^a-z]|$)' then
    raise exception 'Display name must be 3-20 safe characters';
  end if;

  insert into public.grid_rivals_profiles (user_id, display_name, player_level)
    values (
      v_user_id,
      'RIVAL-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6)),
      1
    )
    on conflict on constraint grid_rivals_profiles_pkey do nothing;
  update public.grid_rivals_profiles as profile
    set display_name = p_display_name,
        updated_at = now()
    where profile.user_id = v_user_id
    returning profile.* into v_profile;

  return query select v_profile.user_id, v_profile.display_name, v_profile.player_level;
end;
$$;

create or replace function public.submit_grid_rivals_score(
  p_game_id uuid,
  p_score integer,
  p_game_mode text,
  p_difficulty text,
  p_player_level integer
)
returns table (submitted boolean, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_inserted_id uuid;
  v_max_score integer;
  v_recent_count integer;
begin
  if v_user_id is null then
    raise exception 'Anonymous sign-in is required';
  end if;
  if p_game_id is null or p_score is null or p_score < 0 then
    raise exception 'Invalid game result';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Invalid difficulty';
  end if;
  if p_game_mode not in ('easy', 'medium', 'hard', 'daily') then
    raise exception 'Invalid game mode';
  end if;
  if p_game_mode = 'daily' and p_difficulty <> 'medium'
    or p_game_mode <> 'daily' and p_game_mode <> p_difficulty then
    raise exception 'Game mode and difficulty do not match';
  end if;
  if p_player_level is null or p_player_level not between 1 and 10000 then
    raise exception 'Invalid player level';
  end if;

  v_max_score := case p_difficulty
    when 'easy' then 540
    when 'medium' then 360
    else 400
  end;
  if p_score > v_max_score then
    raise exception 'Score is outside the valid range for this mode';
  end if;

  select score_row.id into v_existing_id
    from public.grid_rivals_scores as score_row
    where score_row.user_id = v_user_id and score_row.game_id = p_game_id;
  if v_existing_id is not null then
    return query select false, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select count(*) into v_recent_count
    from public.grid_rivals_scores as score_row
    where score_row.user_id = v_user_id
      and score_row.achieved_at > now() - interval '5 minutes';
  if v_recent_count >= 20 then
    raise exception 'Too many score submissions. Please try again later';
  end if;

  insert into public.grid_rivals_profiles as current_profile (user_id, display_name, player_level)
  values (
    v_user_id,
    'RIVAL-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6)),
    p_player_level
  )
  on conflict (user_id) do update
    set player_level = excluded.player_level,
        updated_at = now();

  insert into public.grid_rivals_scores (user_id, game_id, score, game_mode, difficulty)
    values (v_user_id, p_game_id, p_score, p_game_mode, p_difficulty)
    on conflict (user_id, game_id) do nothing
    returning id into v_inserted_id;

  if v_inserted_id is null then
    return query select false, true;
  else
    return query select true, false;
  end if;
end;
$$;

create or replace function public.grid_rivals_ranked_scores(
  p_period text,
  p_difficulty text
)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  score integer,
  player_level integer,
  game_mode text,
  achieved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_period is null or p_period not in ('all', 'today', 'week') then
    raise exception 'Invalid leaderboard period';
  end if;
  if p_difficulty is null or p_difficulty not in ('all', 'easy', 'medium', 'hard') then
    raise exception 'Invalid leaderboard difficulty';
  end if;

  return query
    with filtered_scores as (
      select score_row.user_id, profile.display_name, profile.player_level,
        score_row.score, score_row.game_mode, score_row.achieved_at, score_row.id
      from public.grid_rivals_scores as score_row
      join public.grid_rivals_profiles as profile using (user_id)
      where (p_difficulty = 'all' or score_row.difficulty = p_difficulty)
        and (
          p_period = 'all'
          or p_period = 'today' and score_row.achieved_at >=
            ((now() at time zone 'UTC')::date::timestamp at time zone 'UTC')
          or p_period = 'week' and score_row.achieved_at >= now() - interval '7 days'
        )
    ), best_per_player as (
      select distinct on (filtered_scores.user_id)
        filtered_scores.user_id, filtered_scores.display_name, filtered_scores.player_level,
        filtered_scores.score, filtered_scores.game_mode, filtered_scores.achieved_at
      from filtered_scores
      order by filtered_scores.user_id, filtered_scores.score desc,
        filtered_scores.achieved_at asc, filtered_scores.id asc
    )
    select row_number() over (
        order by best_per_player.score desc, best_per_player.achieved_at asc,
          best_per_player.display_name collate "C", best_per_player.user_id
      ) as rank,
      best_per_player.user_id, best_per_player.display_name, best_per_player.score,
      best_per_player.player_level, best_per_player.game_mode, best_per_player.achieved_at
    from best_per_player
    order by best_per_player.score desc, best_per_player.achieved_at asc,
      best_per_player.display_name collate "C", best_per_player.user_id;
end;
$$;

create or replace function public.get_grid_rivals_leaderboard(
  p_period text default 'all',
  p_difficulty text default 'all'
)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  score integer,
  player_level integer,
  game_mode text,
  achieved_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select ranked.rank, ranked.user_id, ranked.display_name, ranked.score,
    ranked.player_level, ranked.game_mode, ranked.achieved_at
  from public.grid_rivals_ranked_scores(p_period, p_difficulty) as ranked
  order by ranked.rank
  limit 100;
$$;

create or replace function public.get_grid_rivals_player_summary(
  p_period text default 'all',
  p_difficulty text default 'all'
)
returns table (best_score integer, player_rank bigint, player_level integer)
language sql
security definer
set search_path = ''
as $$
  select coalesce(ranked.score, 0)::integer, ranked.rank, profile.player_level
  from public.grid_rivals_profiles as profile
  left join public.grid_rivals_ranked_scores(p_period, p_difficulty) as ranked
    on ranked.user_id = profile.user_id
  where profile.user_id = auth.uid();
$$;

revoke all on function public.ensure_grid_rivals_profile(integer) from public, anon;
revoke all on function public.update_grid_rivals_display_name(text) from public, anon;
revoke all on function public.submit_grid_rivals_score(uuid, integer, text, text, integer) from public, anon;
revoke all on function public.grid_rivals_ranked_scores(text, text) from public, anon, authenticated;
revoke all on function public.get_grid_rivals_leaderboard(text, text) from public, anon;
revoke all on function public.get_grid_rivals_player_summary(text, text) from public, anon;

grant execute on function public.ensure_grid_rivals_profile(integer) to authenticated;
grant execute on function public.update_grid_rivals_display_name(text) to authenticated;
grant execute on function public.submit_grid_rivals_score(uuid, integer, text, text, integer) to authenticated;
grant execute on function public.get_grid_rivals_leaderboard(text, text) to authenticated;
grant execute on function public.get_grid_rivals_player_summary(text, text) to authenticated;
