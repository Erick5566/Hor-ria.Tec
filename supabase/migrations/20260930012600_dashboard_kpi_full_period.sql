-- KPI values and their sparklines must use the same selected date range.
-- Preserve the main chart, tenant guards, permissions and priority lists.
do $migration$
declare
  v_def text;
  v_start integer;
  v_end integer;
begin
  v_def := pg_get_functiondef('public.dashboard_overview(date,date)'::regprocedure);
  v_start := strpos(v_def, 'spark_dates as (');
  v_end := strpos(v_def, 'trend_dates as (');
  if v_start = 0 or v_end <= v_start then
    raise exception 'Unexpected dashboard_overview shape: chart date markers missing';
  end if;
  v_def := substr(v_def,1,v_start - 1) || $dates$
spark_dates as (
  select generate_series(v_start, least(v_end, v_today), interval '1 day')::date as d
),
$dates$ || substr(v_def,v_end);
  execute v_def;
end;
$migration$;
