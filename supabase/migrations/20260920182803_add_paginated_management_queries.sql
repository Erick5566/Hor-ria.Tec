-- Restored verbatim from the existing Supabase migration history.

create index if not exists financeiro_empresa_vencimento_idx
  on public.financeiro (empresa_id, vencimento desc);

create index if not exists vendas_empresa_cliente_status_idx
  on public.vendas (empresa_id, cliente_id, status);

create index if not exists equipamentos_empresa_criado_em_idx
  on public.equipamentos (empresa_id, criado_em desc);

create or replace function public.orders_list_page(
  p_page integer default 1,
  p_page_size integer default 30,
  p_search text default null,
  p_status text default null,
  p_technician text default null,
  p_priority text default null,
  p_period integer default null,
  p_sort text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 30), 10), 100);
  v_offset integer;
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

  v_offset := (v_page - 1) * v_size;

  return (
    with filtered as materialized (
      select
        o.id,
        o.numero,
        o.problema,
        o.criado_em,
        o.tecnico,
        o.prioridade,
        o.status,
        o.entrada_confirmada,
        c.nome as cliente_nome,
        e.marca as equipamento_marca,
        e.modelo as equipamento_modelo,
        q.total as quote_total
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      left join lateral (
        select oc.total
        from public.orcamentos oc
        where oc.empresa_id = v_empresa
          and oc.ordem_id = o.id
        order by oc.versao desc
        limit 1
      ) q on true
      where o.empresa_id = v_empresa
        and (coalesce(trim(p_status), '') = '' or o.status = p_status)
        and (coalesce(trim(p_technician), '') = '' or o.tecnico = p_technician)
        and (coalesce(trim(p_priority), '') = '' or o.prioridade = p_priority)
        and (
          p_period is null or p_period <= 0 or
          o.criado_em >= now() - make_interval(days => p_period)
        )
        and (
          coalesce(trim(p_search), '') = '' or
          concat_ws(
            ' ',
            o.numero::text,
            c.nome,
            e.marca,
            e.modelo,
            o.problema
          ) ilike '%' || trim(p_search) || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by
        case when p_sort = 'oldest' then criado_em end asc nulls last,
        case when p_sort = 'value' then quote_total end desc nulls last,
        case when p_sort not in ('oldest', 'value') then criado_em end desc nulls last,
        id
      limit v_size
      offset v_offset
    ),
    all_orders as materialized (
      select
        o.id,
        o.status,
        o.prioridade,
        q.total as quote_total
      from public.ordens_servico o
      left join lateral (
        select oc.total
        from public.orcamentos oc
        where oc.empresa_id = v_empresa
          and oc.ordem_id = o.id
        order by oc.versao desc
        limit 1
      ) q on true
      where o.empresa_id = v_empresa
    )
    select jsonb_build_object(
      'page', v_page,
      'pageSize', v_size,
      'total', (select count(*)::int from filtered),
      'items', coalesce(
        (select jsonb_agg(to_jsonb(p) order by
          case when p_sort = 'oldest' then p.criado_em end asc nulls last,
          case when p_sort = 'value' then p.quote_total end desc nulls last,
          case when p_sort not in ('oldest', 'value') then p.criado_em end desc nulls last,
          p.id
        ) from paged p),
        '[]'::jsonb
      ),
      'technicians', coalesce((
        select jsonb_agg(t.tecnico order by t.tecnico)
        from (
          select distinct trim(o.tecnico) as tecnico
          from public.ordens_servico o
          where o.empresa_id = v_empresa
            and nullif(trim(o.tecnico), '') is not null
        ) t
      ), '[]'::jsonb),
      'metrics', jsonb_build_object(
        'open', (select count(*)::int from all_orders where status not in ('finalizado', 'cancelado')),
        'diagnostic', (select count(*)::int from all_orders where status in ('novo', 'recebido', 'em_diagnostico')),
        'urgent', (select count(*)::int from all_orders where status not in ('finalizado', 'cancelado') and prioridade = 'urgente'),
        'ready', (select count(*)::int from all_orders where status = 'pronto_retirada'),
        'forecast', coalesce((
          select sum(coalesce(quote_total, 0))
          from all_orders
          where status not in ('finalizado', 'cancelado')
        ), 0)
      )
    )
  );
end;
$body$;

create or replace function public.records_list_page(
  p_kind text,
  p_page integer default 1,
  p_page_size integer default 30,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 30), 10), 100);
  v_offset integer;
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

  v_offset := (v_page - 1) * v_size;

  if p_kind = 'clientes' then
    return (
      with filtered as materialized (
        select c.*
        from public.clientes c
        where c.empresa_id = v_empresa
          and (
            coalesce(trim(p_search), '') = '' or
            concat_ws(
              ' ',
              c.nome,
              c.whatsapp,
              c.email,
              c.documento,
              c.telefone
            ) ilike '%' || trim(p_search) || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by criado_em desc, id
        limit v_size
        offset v_offset
      ),
      enriched as (
        select
          c.*,
          coalesce((
            select count(*)::int
            from public.equipamentos e
            where e.empresa_id = v_empresa
              and e.cliente_id = c.id
          ), 0) as equipment_count,
          coalesce((
            select count(*)::int
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.cliente_id = c.id
              and o.status = 'finalizado'
          ), 0) as service_count,
          (
            select o.criado_em
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.cliente_id = c.id
            order by o.criado_em desc
            limit 1
          ) as latest_order_at,
          (
            coalesce((
              select sum(f.valor)
              from public.financeiro f
              join public.ordens_servico o
                on o.id = f.ordem_id and o.empresa_id = v_empresa
              where f.empresa_id = v_empresa
                and o.cliente_id = c.id
                and f.tipo = 'receita'
                and f.status = 'pago'
            ), 0)
            +
            coalesce((
              select sum(v.total)
              from public.vendas v
              where v.empresa_id = v_empresa
                and v.cliente_id = c.id
                and v.status = 'finalizada'
            ), 0)
          ) as relationship_total
        from paged c
      )
      select jsonb_build_object(
        'page', v_page,
        'pageSize', v_size,
        'total', (select count(*)::int from filtered),
        'items', coalesce(
          (select jsonb_agg(to_jsonb(e) order by e.criado_em desc, e.id) from enriched e),
          '[]'::jsonb
        ),
        'metrics', jsonb_build_object(
          'total', (select count(*)::int from public.clientes c where c.empresa_id = v_empresa),
          'withEquipment', (
            select count(distinct e.cliente_id)::int
            from public.equipamentos e
            where e.empresa_id = v_empresa
          ),
          'withOpenOrder', (
            select count(distinct o.cliente_id)::int
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.status not in ('finalizado', 'cancelado')
          ),
          'relationship', (
            coalesce((
              select sum(f.valor)
              from public.financeiro f
              where f.empresa_id = v_empresa
                and f.tipo = 'receita'
                and f.status = 'pago'
            ), 0)
            +
            coalesce((
              select sum(v.total)
              from public.vendas v
              where v.empresa_id = v_empresa
                and v.status = 'finalizada'
            ), 0)
          )
        )
      )
    );
  elsif p_kind = 'equipamentos' then
    return (
      with filtered as materialized (
        select e.*
        from public.equipamentos e
        left join public.clientes c
          on c.id = e.cliente_id and c.empresa_id = v_empresa
        where e.empresa_id = v_empresa
          and (
            coalesce(trim(p_search), '') = '' or
            concat_ws(
              ' ',
              e.categoria,
              e.tipo_personalizado,
              e.marca,
              e.modelo,
              e.numero_serie,
              e.imei,
              c.nome
            ) ilike '%' || trim(p_search) || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by criado_em desc, id
        limit v_size
        offset v_offset
      ),
      enriched as (
        select
          e.*,
          c.nome as cliente_nome,
          coalesce((
            select count(*)::int
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.equipamento_id = e.id
          ), 0) as order_count,
          (
            select o.status
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.equipamento_id = e.id
            order by o.criado_em desc
            limit 1
          ) as latest_status
        from paged e
        left join public.clientes c
          on c.id = e.cliente_id and c.empresa_id = v_empresa
      )
      select jsonb_build_object(
        'page', v_page,
        'pageSize', v_size,
        'total', (select count(*)::int from filtered),
        'items', coalesce(
          (select jsonb_agg(to_jsonb(e) order by e.criado_em desc, e.id) from enriched e),
          '[]'::jsonb
        ),
        'metrics', jsonb_build_object(
          'total', (select count(*)::int from public.equipamentos e where e.empresa_id = v_empresa),
          'inService', (
            select count(distinct o.equipamento_id)::int
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.status not in ('finalizado', 'cancelado')
          ),
          'finishedRepairs', (
            select count(*)::int
            from public.ordens_servico o
            where o.empresa_id = v_empresa
              and o.status = 'finalizado'
          ),
          'categories', (
            select count(distinct e.categoria)::int
            from public.equipamentos e
            where e.empresa_id = v_empresa
              and nullif(trim(e.categoria), '') is not null
          )
        )
      )
    );
  end if;

  raise exception 'Tipo de registro inválido';
end;
$body$;

create or replace function public.finance_overview_page(
  p_page integer default 1,
  p_page_size integer default 30,
  p_order_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 30), 10), 100);
  v_offset integer;
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

  if p_order_id is not null and not exists (
    select 1
    from public.ordens_servico o
    where o.id = p_order_id and o.empresa_id = v_empresa
  ) then
    raise exception 'Ordem inválida';
  end if;

  v_offset := (v_page - 1) * v_size;

  return (
    with base as materialized (
      select f.*
      from public.financeiro f
      where f.empresa_id = v_empresa
        and (p_order_id is null or f.ordem_id = p_order_id)
    ),
    paged as (
      select *
      from base
      order by vencimento desc, criado_em desc, id
      limit v_size
      offset v_offset
    ),
    paid as materialized (
      select *
      from base
      where status = 'pago'
    ),
    evolution_days as (
      select generate_series(v_today - 13, v_today, interval '1 day')::date as d
    )
    select jsonb_build_object(
      'page', v_page,
      'pageSize', v_size,
      'total', (select count(*)::int from base),
      'entries', coalesce(
        (select jsonb_agg(to_jsonb(p) order by p.vencimento desc, p.criado_em desc, p.id) from paged p),
        '[]'::jsonb
      ),
      'metrics', jsonb_build_object(
        'revenue', coalesce((select sum(valor) from paid where tipo = 'receita'), 0),
        'expense', coalesce((select sum(valor) from paid where tipo = 'despesa'), 0),
        'pendingRevenue', coalesce((
          select sum(valor)
          from base
          where tipo = 'receita' and status = 'pendente'
        ), 0),
        'pendingCount', (
          select count(*)::int
          from base
          where tipo = 'receita' and status = 'pendente'
        ),
        'paidRevenueCount', (
          select count(*)::int
          from paid
          where tipo = 'receita'
        ),
        'finalizedOrders', (
          select count(*)::int
          from public.ordens_servico o
          where o.empresa_id = v_empresa
            and o.status = 'finalizado'
        )
      ),
      'origins', jsonb_build_object(
        'reparo', coalesce((select sum(valor) from paid where tipo = 'receita' and origem = 'reparo'), 0),
        'loja', coalesce((select sum(valor) from paid where tipo = 'receita' and origem = 'loja'), 0),
        'seminovo', coalesce((select sum(valor) from paid where tipo = 'receita' and origem = 'seminovo'), 0),
        'manual', coalesce((select sum(valor) from paid where tipo = 'receita' and origem = 'manual'), 0)
      ),
      'recent', coalesce((
        select jsonb_agg(to_jsonb(r) order by coalesce(r.pago_em, r.vencimento) desc, r.id)
        from (
          select *
          from base
          order by coalesce(pago_em, vencimento) desc, criado_em desc
          limit 6
        ) r
      ), '[]'::jsonb),
      'pending', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.vencimento, r.id)
        from (
          select *
          from base
          where status = 'pendente' and tipo = 'receita'
          order by vencimento
          limit 5
        ) r
      ), '[]'::jsonb),
      'evolution', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'key', d.d::text,
            'receita', coalesce((
              select sum(p.valor)
              from paid p
              where p.tipo = 'receita' and p.pago_em = d.d
            ), 0),
            'despesa', coalesce((
              select sum(p.valor)
              from paid p
              where p.tipo = 'despesa' and p.pago_em = d.d
            ), 0)
          )
          order by d.d
        )
        from evolution_days d
      ), '[]'::jsonb)
    )
  );
end;
$body$;

revoke all on function public.orders_list_page(integer,integer,text,text,text,text,integer,text) from public;
grant execute on function public.orders_list_page(integer,integer,text,text,text,text,integer,text) to authenticated;

revoke all on function public.records_list_page(text,integer,integer,text) from public;
grant execute on function public.records_list_page(text,integer,integer,text) to authenticated;

revoke all on function public.finance_overview_page(integer,integer,uuid) from public;
grant execute on function public.finance_overview_page(integer,integer,uuid) to authenticated;


