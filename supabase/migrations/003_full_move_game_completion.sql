begin;

-- Version 2 changes completion semantics: every game consumes its full move allowance.
-- New runs are stamped with rules_version=2; old in-flight version 1 runs must be
-- completed before this migration is deployed.

do $$
declare
  v_definition text;
  v_updated text;
begin
  v_definition := pg_catalog.pg_get_functiondef(
    'public.create_grid_rivals_game_run(uuid,text,text,bigint)'::regprocedure
  );
  if pg_catalog.position(E'    v_seed,\n    1,\n    1,\n    v_daily_date,' in v_definition) = 0 then
    raise exception 'Could not locate game-run rules version in create_grid_rivals_game_run';
  end if;
  v_updated := pg_catalog.replace(
    v_definition,
    E'    v_seed,\n    1,\n    1,\n    v_daily_date,',
    E'    v_seed,\n    2,\n    1,\n    v_daily_date,'
  );
  execute v_updated;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.finalize_grid_rivals_run(uuid,integer,text,integer,integer,integer)'::regprocedure
  );

  if pg_catalog.position(
    'if v_run.rules_version <> 1 or v_run.rng_version <> 1 then',
    v_definition
  ) = 0 then
    raise exception 'Could not locate rules version check in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'if v_run.rules_version <> 1 or v_run.rng_version <> 1 then',
    'if v_run.rules_version <> 2 or v_run.rng_version <> 1 then'
  );

  if pg_catalog.position(
    'v_max_score := (200 - 10) + (v_max_tile_value * 10);',
    v_definition
  ) = 0 then
    raise exception 'Could not locate score ceiling in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'v_max_score := (200 - 10) + (v_max_tile_value * 10);',
    'v_max_score := (case v_run.difficulty when ''easy'' then 18 when ''medium'' then 12 when ''hard'' then 8 end) * v_max_tile_value * 10;'
  );

  if pg_catalog.position(
    E"or (p_score >= 200 and p_final_status <> 'won')\n    or (p_score < 200 and (p_moves_remaining <> 0 or p_final_status <> 'lost'))",
    v_definition
  ) = 0 then
    raise exception 'Could not locate terminal-result validation in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    E"or (p_score >= 200 and p_final_status <> 'won')\n    or (p_score < 200 and (p_moves_remaining <> 0 or p_final_status <> 'lost'))",
    E"or p_moves_remaining <> 0\n    or (p_score >= 200 and p_final_status <> 'won')\n    or (p_score < 200 and p_final_status <> 'lost')"
  );

  -- The old unused-moves achievement is now awarded for a win after all moves.
  if pg_catalog.position(
    'p_final_status = ''won'' and p_moves_remaining > 0',
    v_definition
  ) = 0 then
    raise exception 'Could not locate perfect-strategist eligibility in finalize_grid_rivals_run';
  end if;
  v_definition := pg_catalog.replace(
    v_definition,
    'p_final_status = ''won'' and p_moves_remaining > 0',
    'p_final_status = ''won'' and p_moves_remaining = 0'
  );

  execute v_definition;
end;
$$;

commit;
