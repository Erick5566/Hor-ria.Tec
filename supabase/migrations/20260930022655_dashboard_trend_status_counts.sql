-- Count disjoint current statuses by creation day, keeping all existing access guards.
do $migration$
declare
  v_def text;
  v_next text;
  v_before text := $old$(select count(*)::int from period_orders po where po.criado_dia = d) as opened,$old$;
  v_after text := $new$(select count(*)::int from period_orders po where po.criado_dia = d and po.status in ('novo', 'recebido')) as opened,
            (select count(*)::int from period_orders po where po.criado_dia = d and po.status in ('em_diagnostico', 'aguardando_orcamento', 'orcamento_enviado', 'aguardando_aprovacao', 'orcamento_aprovado', 'em_reparo', 'em_testes')) as active,
            (select count(*)::int from period_orders po where po.criado_dia = d and po.status = 'pronto_retirada') as ready,$new$;
begin
  v_def := pg_get_functiondef('public.dashboard_overview(date,date)'::regprocedure);
  if strpos(v_def, v_before) = 0 or strpos(v_def, '''active'', greatest(0, t.opened - t.finalized)') = 0 then
    raise exception 'Unexpected dashboard trend structure';
  end if;
  v_next := replace(v_def, v_before, v_after);
  v_next := replace(v_next, '''active'', greatest(0, t.opened - t.finalized)', '''active'', t.active, ''ready'', t.ready');
  execute v_next;
end;
$migration$;
