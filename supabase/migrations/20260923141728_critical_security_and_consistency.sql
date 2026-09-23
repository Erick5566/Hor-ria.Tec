-- Restore the helper permission required while authenticated RLS policies are
-- evaluated. The private schema remains outside the exposed PostgREST schemas.
grant execute on function private.has_company_role(uuid,text[]) to authenticated;

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
  v_can_manage boolean := false;
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

  v_can_manage := private.can_manage_company(v_empresa);
  v_offset := (v_page - 1) * v_size;

  if p_kind = 'clientes' then
    return (
      with filtered as materialized (
        select c.*
        from public.clientes c
        where c.empresa_id = v_empresa
          and (
            coalesce(trim(p_search), '') = '' or
            concat_ws(' ', c.nome, c.whatsapp, c.email, c.documento, c.telefone)
              ilike '%' || trim(p_search) || '%'
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
            where e.empresa_id = v_empresa and e.cliente_id = c.id
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
            where o.empresa_id = v_empresa and o.cliente_id = c.id
            order by o.criado_em desc
            limit 1
          ) as latest_order_at,
          case when v_can_manage then (
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
          ) else 0 end as relationship_total
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
          -- Finalized sales already create a paid finance entry. Summing only
          -- the ledger avoids counting the same revenue twice.
          'relationship', case when v_can_manage then coalesce((
            select sum(f.valor)
            from public.financeiro f
            where f.empresa_id = v_empresa
              and f.tipo = 'receita'
              and f.status = 'pago'
          ), 0) else 0 end
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
              ' ', e.categoria, e.tipo_personalizado, e.marca, e.modelo,
              e.numero_serie, e.imei, c.nome
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
            where o.empresa_id = v_empresa and o.equipamento_id = e.id
          ), 0) as order_count,
          (
            select o.status
            from public.ordens_servico o
            where o.empresa_id = v_empresa and o.equipamento_id = e.id
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
            where o.empresa_id = v_empresa and o.status = 'finalizado'
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

revoke all on function public.records_list_page(text,integer,integer,text) from public;
grant execute on function public.records_list_page(text,integer,integer,text) to authenticated;
