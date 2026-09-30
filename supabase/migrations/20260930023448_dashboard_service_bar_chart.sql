-- Add complete period totals for the categorical bar chart; preserve all access guards.
do $migration$
declare
  v_def text;
  v_marker text := $marker$'trend', ($marker$;
  v_chart text := $chart$'serviceChart', jsonb_build_object(
        'bookings', (select count(*)::int from public.agendamentos a
          where a.empresa_id = v_empresa and not a.bloqueio
            and (a.inicio at time zone 'America/Sao_Paulo')::date between v_start and v_end),
        'opened', (select count(*)::int from period_orders where status in ('novo', 'recebido')),
        'active', (select count(*)::int from period_orders where status in ('em_diagnostico', 'aguardando_orcamento', 'orcamento_enviado', 'aguardando_aprovacao', 'orcamento_aprovado', 'em_reparo', 'em_testes')),
        'parts', (select count(*)::int from period_orders where status = 'aguardando_peca'),
        'ready', (select count(*)::int from period_orders where status = 'pronto_retirada'),
        'finished', (select count(*)::int from period_finished)
      ),
      'trend', ($chart$;
begin
  v_def := pg_get_functiondef('public.dashboard_overview(date,date)'::regprocedure);
  if strpos(v_def, v_marker) = 0 or strpos(v_def, '''serviceChart''') > 0 then
    raise exception 'Unexpected dashboard structure';
  end if;
  execute replace(v_def, v_marker, v_chart);
end;
$migration$;
