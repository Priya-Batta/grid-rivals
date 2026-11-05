begin;

-- Serialize run creation while checking for active v1 games and switching the
-- database functions to rules version 2.
lock table public.grid_rivals_game_runs in access exclusive mode;

do $migration$
begin
  if exists (
    select 1
    from public.grid_rivals_game_runs as run_row
    where run_row.rules_version = 1
      and run_row.consumed_at is null
      and run_row.expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception
      'Cannot enable rules version 2 while unexpired version 1 game runs remain. Wait for them to finish or expire, then retry.';
  end if;
end;
$migration$;

-- Version 2 changes completion semantics: every game consumes its full move allowance.

do $migration$
declare
  v_definition text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.create_grid_rivals_game_run(uuid,text,text,bigint)'::regprocedure
  );
  if pg_catalog.strpos(v_definition, $old$    v_seed,
    1,
    1,
    v_daily_date,$old$) = 0 then
    raise exception 'Could not locate game-run rules version in create_grid_rivals_game_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$    v_seed,
    1,
    1,
    v_daily_date,$old$,
    $new$    v_seed,
    2,
    1,
    v_daily_date,$new$
  );
  execute v_definition;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.finalize_grid_rivals_run(uuid,integer,text,integer,integer,integer)'::regprocedure
  );

  if pg_catalog.strpos(v_definition, $old$if v_run.rules_version <> 1 or v_run.rng_version <> 1 then$old$) = 0 then
    raise exception 'Could not locate rules version check in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$if v_run.rules_version <> 1 or v_run.rng_version <> 1 then$old$,
    $new$if v_run.rules_version <> 2 or v_run.rng_version <> 1 then$new$
  );

  if pg_catalog.strpos(v_definition, $old$v_max_score := (200 - 10) + (v_max_tile_value * 10);$old$) = 0 then
    raise exception 'Could not locate score ceiling in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$v_max_score := (200 - 10) + (v_max_tile_value * 10);$old$,
    $new$v_max_score := (case v_run.difficulty when 'easy' then 18 when 'medium' then 12 when 'hard' then 8 end) * v_max_tile_value * 10;$new$
  );

  if pg_catalog.strpos(
    v_definition,
    $old$or (p_score >= 200 and p_final_status <> 'won')
    or (p_score < 200 and (p_moves_remaining <> 0 or p_final_status <> 'lost'))$old$
  ) = 0 then
    raise exception 'Could not locate terminal-result validation in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$or (p_score >= 200 and p_final_status <> 'won')
    or (p_score < 200 and (p_moves_remaining <> 0 or p_final_status <> 'lost'))$old$,
    $new$or p_moves_remaining <> 0
    or (p_score >= 200 and p_final_status <> 'won')
    or (p_score < 200 and p_final_status <> 'lost')$new$
  );

  -- The previous unused-moves achievement now represents completing a winning run.
  if pg_catalog.strpos(
    v_definition,
    $old$p_final_status = 'won' and p_moves_remaining > 0$old$
  ) = 0 then
    raise exception 'Could not locate perfect-strategist eligibility in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    $old$p_final_status = 'won' and p_moves_remaining > 0$old$,
    $new$p_final_status = 'won' and p_moves_remaining = 0 and p_score >= 300$new$
  );

  execute v_definition;
end;
$migration$;

commit;
