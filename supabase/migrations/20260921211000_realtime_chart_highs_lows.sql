-- Keep dashboard chart series non-cumulative so the UI reflects real daily highs and lows.
-- The dashboard already refreshes from Supabase Realtime; this migration only changes
-- the aggregation shape returned by dashboard_overview.

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

  -- KPI mini charts: show the amount for each day instead of a running total.
  v_next := replace(
    v_next,
    'and (o.criado_em at time zone ''America/Sao_Paulo'')::date <= d',
    'and (o.criado_em at time zone ''America/Sao_Paulo'')::date = d'
  );

  -- Main OS evolution chart: each point represents that day, allowing rises and falls.
  v_next := replace(
    v_next,
    'where po.criado_dia <= d',
    'where po.criado_dia = d'
  );
  v_next := replace(
    v_next,
    'where pf.atualizado_dia <= d',
    'where pf.atualizado_dia = d'
  );

  if v_next is distinct from v_def then
    execute v_next;
  end if;
end
$$;
