-- Restored verbatim from the existing Supabase migration history.

create index if not exists ordens_servico_empresa_criado_em_idx
  on public.ordens_servico (empresa_id, criado_em desc);

create index if not exists ordens_servico_empresa_finalizado_atualizado_idx
  on public.ordens_servico (empresa_id, atualizado_em desc)
  where status = 'finalizado';

create index if not exists clientes_empresa_criado_em_idx
  on public.clientes (empresa_id, criado_em desc);

create index if not exists financeiro_empresa_pago_em_idx
  on public.financeiro (empresa_id, pago_em desc)
  where pago_em is not null;

create or replace function public.dashboard_overview(
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_today date;
  v_start date;
  v_end date;
  v_days integer;
  v_prev_start date;
  v_prev_end date;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_start := least(coalesce(p_start, v_today), coalesce(p_end, v_today));
  v_end := greatest(coalesce(p_start, v_today), coalesce(p_end, v_today));
  v_days := greatest(1, v_end - v_start + 1);
  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  join public.empresas e on e.id = m.empresa_id
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
    with period_orders as materialized (
      select
        o.id,
        o.numero,
        o.cliente_id,
        o.equipamento_id,
        o.status,
        o.prioridade,
        o.iniciado_em,
        o.prazo_previsto,
        o.criado_em,
        o.atualizado_em,
        (o.criado_em at time zone 'America/Sao_Paulo')::date as criado_dia,
        (o.atualizado_em at time zone 'America/Sao_Paulo')::date as atualizado_dia
      from public.ordens_servico o
      where o.empresa_id = v_empresa
        and (o.criado_em at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    period_finished as materialized (
      select
        o.id,
        o.numero,
        o.cliente_id,
        o.equipamento_id,
        o.status,
        o.iniciado_em,
        o.criado_em,
        o.atualizado_em,
        (o.atualizado_em at time zone 'America/Sao_Paulo')::date as atualizado_dia
      from public.ordens_servico o
      where o.empresa_id = v_empresa
        and o.status = 'finalizado'
        and (o.atualizado_em at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    spark_dates as (
      select generate_series(v_end - 6, v_end, interval '1 day')::date as d
    ),
    trend_dates as (
      select generate_series(greatest(v_start, v_end - 29), v_end, interval '1 day')::date as d
    ),
    status_values as (
      select
        count(*) filter (where status = 'finalizado')::int as concluidas,
        count(*) filter (
          where status not in (
            'finalizado',
            'cancelado',
            'aguardando_peca',
            'aguardando_orcamento',
            'orcamento_enviado',
            'aguardando_aprovacao'
          )
        )::int as andamento,
        count(*) filter (where status = 'aguardando_peca')::int as pecas,
        count(*) filter (
          where status in (
            'aguardando_orcamento',
            'orcamento_enviado',
            'aguardando_aprovacao'
          )
        )::int as orcamento,
        count(*) filter (where status = 'cancelado')::int as canceladas,
        count(*)::int as total
      from period_orders
    )
    select jsonb_build_object(
      'metrics', jsonb_build_object(
        'periodOrders', (select count(*)::int from period_orders),
        'previousPeriodOrders', (
          select count(*)::int
          from public.ordens_servico o
          where o.empresa_id = v_empresa
            and (o.criado_em at time zone 'America/Sao_Paulo')::date between v_prev_start and v_prev_end
        ),
        'periodFinished', (select count(*)::int from period_finished),
        'previousPeriodFinished', (
          select count(*)::int
          from public.ordens_servico o
          where o.empresa_id = v_empresa
            and o.status = 'finalizado'
            and (o.atualizado_em at time zone 'America/Sao_Paulo')::date between v_prev_start and v_prev_end
        ),
        'periodClients', (
          select count(*)::int
          from public.clientes c
          where c.empresa_id = v_empresa
            and (c.criado_em at time zone 'America/Sao_Paulo')::date between v_start and v_end
        ),
        'previousPeriodClients', (
          select count(*)::int
          from public.clientes c
          where c.empresa_id = v_empresa
            and (c.criado_em at time zone 'America/Sao_Paulo')::date between v_prev_start and v_prev_end
        ),
        'periodRevenue', coalesce((
          select sum(f.valor)
          from public.financeiro f
          where f.empresa_id = v_empresa
            and f.tipo = 'receita'
            and f.status = 'pago'
            and f.pago_em between v_start and v_end
        ), 0),
        'previousPeriodRevenue', coalesce((
          select sum(f.valor)
          from public.financeiro f
          where f.empresa_id = v_empresa
            and f.tipo = 'receita'
            and f.status = 'pago'
            and f.pago_em between v_prev_start and v_prev_end
        ), 0),
        'inProgress', (
          select count(*)::int
          from period_orders
          where status not in ('finalizado', 'cancelado')
        ),
        'awaitingParts', (
          select count(*)::int
          from period_orders
          where status = 'aguardando_peca'
        )
      ),
      'spark', jsonb_build_object(
        'orders', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, (
              select count(*)::int
              from public.ordens_servico o
              where o.empresa_id = v_empresa
                and (o.criado_em at time zone 'America/Sao_Paulo')::date = d
            ) as value
            from spark_dates
          ) s
        ),
        'active', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, (
              select count(*)::int
              from public.ordens_servico o
              where o.empresa_id = v_empresa
                and o.status not in ('finalizado', 'cancelado')
                and (o.criado_em at time zone 'America/Sao_Paulo')::date <= d
            ) as value
            from spark_dates
          ) s
        ),
        'finished', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, (
              select count(*)::int
              from public.ordens_servico o
              where o.empresa_id = v_empresa
                and o.status = 'finalizado'
                and (o.atualizado_em at time zone 'America/Sao_Paulo')::date = d
            ) as value
            from spark_dates
          ) s
        ),
        'parts', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, (
              select count(*)::int
              from public.ordens_servico o
              where o.empresa_id = v_empresa
                and o.status = 'aguardando_peca'
                and (o.criado_em at time zone 'America/Sao_Paulo')::date <= d
            ) as value
            from spark_dates
          ) s
        ),
        'clients', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, (
              select count(*)::int
              from public.clientes c
              where c.empresa_id = v_empresa
                and (c.criado_em at time zone 'America/Sao_Paulo')::date = d
            ) as value
            from spark_dates
          ) s
        ),
        'revenue', (
          select coalesce(jsonb_agg(s.value order by s.d), '[]'::jsonb)
          from (
            select d, coalesce((
              select sum(f.valor)
              from public.financeiro f
              where f.empresa_id = v_empresa
                and f.tipo = 'receita'
                and f.status = 'pago'
                and f.pago_em = d
            ), 0) as value
            from spark_dates
          ) s
        )
      ),
      'trend', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'key', t.d::text,
              'opened', t.opened,
              'active', greatest(0, t.opened - t.finalized),
              'finalized', t.finalized
            )
            order by t.d
          ),
          '[]'::jsonb
        )
        from (
          select
            d,
            (select count(*)::int from period_orders po where po.criado_dia <= d) as opened,
            (select count(*)::int from period_finished pf where pf.atualizado_dia <= d) as finalized
          from trend_dates
        ) t
      ),
      'status', (
        select jsonb_build_object(
          'concluidas', concluidas,
          'andamento', andamento,
          'pecas', pecas,
          'orcamento', orcamento,
          'canceladas', canceladas,
          'outros', greatest(0, total - concluidas - andamento - pecas - orcamento - canceladas)
        )
        from status_values
      ),
      'performance', jsonb_build_object(
        'completionRate', coalesce((
          select round(
            100.0 * count(*) filter (where status = 'finalizado') /
            nullif(count(*), 0)
          )::int
          from period_orders
        ), 0),
        'averageRepairDays', (
          select case
            when count(*) = 0 then null
            else round(
              avg(
                greatest(
                  0,
                  extract(epoch from (atualizado_em - coalesce(iniciado_em, criado_em))) / 86400.0
                )
              )::numeric,
              1
            )
          end
          from period_orders
          where status = 'finalizado'
        )
      ),
      'latestOrders', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', x.id,
              'numero', x.numero,
              'status', x.status,
              'criado_em', x.criado_em,
              'cliente_nome', x.cliente_nome,
              'equipamento_modelo', x.equipamento_modelo
            )
            order by x.criado_em desc
          ),
          '[]'::jsonb
        )
        from (
          select
            po.id,
            po.numero,
            po.status,
            po.criado_em,
            coalesce(c.nome, 'Cliente') as cliente_nome,
            coalesce(e.modelo, 'Equipamento') as equipamento_modelo
          from period_orders po
          left join public.clientes c
            on c.id = po.cliente_id and c.empresa_id = v_empresa
          left join public.equipamentos e
            on e.id = po.equipamento_id and e.empresa_id = v_empresa
          order by po.criado_em desc
          limit 6
        ) x
      ),
      'todayAgenda', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'inicio', a.inicio,
              'nome_cliente', a.nome_cliente,
              'descricao', a.descricao
            )
            order by a.inicio
          ),
          '[]'::jsonb
        )
        from (
          select id, inicio, nome_cliente, descricao
          from public.agendamentos
          where empresa_id = v_empresa
            and not bloqueio
            and (inicio at time zone 'America/Sao_Paulo')::date = v_today
          order by inicio
          limit 6
        ) a
      ),
      'priorities', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'numero', p.numero,
              'prioridade', p.prioridade,
              'prazo_previsto', p.prazo_previsto,
              'equipamento_modelo', p.equipamento_modelo
            )
            order by p.priority_rank, p.prazo_previsto
          ),
          '[]'::jsonb
        )
        from (
          select
            po.id,
            po.numero,
            po.prioridade,
            po.prazo_previsto,
            coalesce(e.modelo, 'Equipamento') as equipamento_modelo,
            case po.prioridade
              when 'urgente' then 0
              when 'alta' then 1
              when 'normal' then 2
              else 3
            end as priority_rank
          from period_orders po
          left join public.equipamentos e
            on e.id = po.equipamento_id and e.empresa_id = v_empresa
          where po.status not in ('finalizado', 'cancelado')
            and po.prazo_previsto is not null
          order by priority_rank, po.prazo_previsto
          limit 6
        ) p
      )
    )
  );
end;
$body$;

revoke all on function public.dashboard_overview(date, date) from public;
grant execute on function public.dashboard_overview(date, date) to authenticated;


