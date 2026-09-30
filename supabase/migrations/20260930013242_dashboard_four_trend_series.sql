-- Add a real fourth daily series, keeping the dashboard's access and period guards.
do $migration$
declare
  v_def text;
  v_next text;
begin
  v_def := pg_get_functiondef('public.dashboard_overview(date,date)'::regprocedure);
  if strpos(v_def, '''finalized'', t.finalized') = 0 or strpos(v_def, 'from period_finished pf where pf.atualizado_dia = d) as finalized') = 0 then
    raise exception 'Unexpected dashboard trend structure';
  end if;
  v_next := replace(v_def, '''finalized'', t.finalized', '''finalized'', t.finalized, ''parts'', t.parts');
  v_next := replace(v_next,
    'from period_finished pf where pf.atualizado_dia = d) as finalized',
    'from period_finished pf where pf.atualizado_dia = d) as finalized,
     (select count(*)::int from period_orders po where po.criado_dia = d and po.status = ''aguardando_peca'') as parts');
  execute v_next;
end;
$migration$;
