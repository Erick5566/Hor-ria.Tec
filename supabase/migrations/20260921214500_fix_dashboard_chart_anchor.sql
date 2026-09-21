-- Anchor dashboard charts to the latest real day inside the selected period.
-- For the current month this means "up to today", avoiding future empty days
-- (for example Sep 24-30 while today is Sep 21) flattening the sparklines.

do $$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'dashboard_overview'
  limit 1;

  if v_def is null then
    raise exception 'dashboard_overview not found';
  end if;

  v_next := v_def;

  v_next := replace(
    v_next,
    'spark_dates as (
      select generate_series(v_end - 6, v_end, interval ''1 day'')::date as d
    )',
    'spark_dates as (
      select generate_series(
        greatest(
          v_start,
          least(v_end, greatest(v_start, v_today)) - 6
        ),
        least(v_end, greatest(v_start, v_today)),
        interval ''1 day''
      )::date as d
    )'
  );

  v_next := replace(
    v_next,
    'trend_dates as (
      select generate_series(greatest(v_start, v_end - 29), v_end, interval ''1 day'')::date as d
    )',
    'trend_dates as (
      select generate_series(
        greatest(
          v_start,
          least(v_end, greatest(v_start, v_today)) - 29
        ),
        least(v_end, greatest(v_start, v_today)),
        interval ''1 day''
      )::date as d
    )'
  );

  if v_next is distinct from v_def then
    execute v_next;
  end if;
end
$$;
