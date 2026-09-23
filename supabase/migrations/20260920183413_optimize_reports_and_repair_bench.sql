-- Restored verbatim from the existing Supabase migration history.

create or replace function public.reports_month_overview(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_start date;
  v_end date;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  begin
    v_start := (p_month || '-01')::date;
  exception when others then
    v_start := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  end;
  v_end := (v_start + interval '1 month')::date;

  return (
    with month_orders as materialized (
      select
        o.id,
        o.numero,
        o.criado_em,
        o.status,
        e.modelo as equipamento_modelo
      from public.ordens_servico o
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      where o.empresa_id = v_empresa
        and o.criado_em >= v_start
        and o.criado_em < v_end
    ),
    month_finance as materialized (
      select f.tipo, f.valor
      from public.financeiro f
      where f.empresa_id = v_empresa
        and f.status = 'pago'
        and f.pago_em >= v_start
        and f.pago_em < v_end
    )
    select jsonb_build_object(
      'metrics', jsonb_build_object(
        'orders', (select count(*)::int from month_orders),
        'income', coalesce((select sum(valor) from month_finance where tipo='receita'), 0),
        'cost', coalesce((select sum(valor) from month_finance where tipo='despesa'), 0)
      ),
      'statuses', coalesce((
        select jsonb_object_agg(status, count_value)
        from (
          select status, count(*)::int as count_value
          from month_orders
          group by status
        ) s
      ), '{}'::jsonb),
      'rows', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'numero', numero,
            'criado_em', criado_em,
            'status', status,
            'equipamento_modelo', coalesce(equipamento_modelo, 'Equipamento')
          )
          order by criado_em desc
        )
        from month_orders
      ), '[]'::jsonb)
    )
  );
end;
$body$;

create or replace function public.repair_bench_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  return (
    with active as materialized (
      select
        o.id,
        o.numero,
        o.problema,
        o.status,
        o.prioridade,
        o.tecnico,
        o.mesa_id,
        o.prazo_previsto,
        c.nome as cliente_nome,
        e.marca as equipamento_marca,
        e.modelo as equipamento_modelo
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      where o.empresa_id = v_empresa
        and o.status not in ('finalizado', 'cancelado')
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.numero desc)
        from active a
      ), '[]'::jsonb),
      'technicians', coalesce((
        select jsonb_agg(t.tecnico order by t.tecnico)
        from (
          select distinct trim(tecnico) as tecnico
          from active
          where nullif(trim(tecnico), '') is not null
        ) t
      ), '[]'::jsonb)
    )
  );
end;
$body$;

revoke all on function public.reports_month_overview(text) from public;
grant execute on function public.reports_month_overview(text) to authenticated;

revoke all on function public.repair_bench_data() from public;
grant execute on function public.repair_bench_data() to authenticated;


