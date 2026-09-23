-- Restored verbatim from the existing Supabase migration history.

create index if not exists movimentos_estoque_empresa_criado_idx
  on public.movimentos_estoque (empresa_id, criado_em desc);

create index if not exists pecas_empresa_nome_idx
  on public.pecas (empresa_id, nome);

create index if not exists servicos_empresa_nome_idx
  on public.servicos (empresa_id, nome);

create or replace function public.inventory_page(
  p_page integer default 1,
  p_page_size integer default 24,
  p_search text default null,
  p_type text default null,
  p_availability text default null
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
  v_size integer := least(greatest(coalesce(p_page_size, 24), 8), 100);
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
      select p.*
      from public.pecas p
      where p.empresa_id = v_empresa
        and (
          coalesce(trim(p_search), '') = '' or
          concat_ws(
            ' ',
            p.nome,
            p.compatibilidade,
            p.sku,
            p.codigo_barras,
            p.categoria
          ) ilike '%' || trim(p_search) || '%'
        )
        and (
          coalesce(trim(p_type), '') in ('', 'Todos') or
          p.tipo = p_type
        )
        and (
          coalesce(trim(p_availability), '') in ('', 'Todos') or
          (p_availability = 'Disponível' and p.quantidade > p.estoque_minimo) or
          (p_availability = 'Baixo' and p.quantidade > 0 and p.quantidade <= p.estoque_minimo) or
          (p_availability = 'Sem estoque' and p.quantidade = 0)
        )
    ),
    paged as (
      select *
      from filtered
      order by ativo desc, nome, id
      limit v_size
      offset v_offset
    ),
    active as materialized (
      select *
      from public.pecas p
      where p.empresa_id = v_empresa
        and p.ativo
    )
    select jsonb_build_object(
      'page', v_page,
      'pageSize', v_size,
      'total', (select count(*)::int from filtered),
      'items', coalesce(
        (select jsonb_agg(to_jsonb(p) order by p.ativo desc, p.nome, p.id) from paged p),
        '[]'::jsonb
      ),
      'metrics', jsonb_build_object(
        'units', coalesce((select sum(quantidade)::int from active), 0),
        'value', coalesce((select sum(quantidade * custo) from active), 0),
        'low', (
          select count(*)::int
          from active
          where quantidade > 0 and quantidade <= estoque_minimo
        ),
        'empty', (
          select count(*)::int
          from active
          where quantidade = 0
        )
      ),
      'movements', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'peca_id', m.peca_id,
            'ordem_id', m.ordem_id,
            'quantidade', m.quantidade,
            'motivo', m.motivo,
            'criado_em', m.criado_em,
            'peca_nome', coalesce(p.nome, 'Item')
          )
          order by m.criado_em desc
        )
        from (
          select *
          from public.movimentos_estoque
          where empresa_id = v_empresa
          order by criado_em desc
          limit 20
        ) m
        left join public.pecas p
          on p.id = m.peca_id and p.empresa_id = v_empresa
      ), '[]'::jsonb)
    )
  );
end;
$body$;

create or replace function public.catalog_page(
  p_stock boolean default false,
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

  if p_stock then
    return (
      with filtered as materialized (
        select p.*
        from public.pecas p
        where p.empresa_id = v_empresa
          and (
            coalesce(trim(p_search), '') = '' or
            concat_ws(' ', p.nome, p.compatibilidade, p.categoria)
              ilike '%' || trim(p_search) || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by nome, id
        limit v_size
        offset v_offset
      )
      select jsonb_build_object(
        'page', v_page,
        'pageSize', v_size,
        'total', (select count(*)::int from filtered),
        'items', coalesce(
          (select jsonb_agg(to_jsonb(p) order by p.nome, p.id) from paged p),
          '[]'::jsonb
        ),
        'metrics', jsonb_build_object(
          'total', (
            select count(*)::int from public.pecas p where p.empresa_id = v_empresa
          ),
          'active', (
            select count(*)::int
            from public.pecas p
            where p.empresa_id = v_empresa and p.quantidade > 0
          ),
          'averagePrice', coalesce((
            select avg(p.preco) from public.pecas p where p.empresa_id = v_empresa
          ), 0),
          'secondary', (
            select count(distinct nullif(trim(p.compatibilidade), ''))::int
            from public.pecas p
            where p.empresa_id = v_empresa
          )
        )
      )
    );
  end if;

  return (
    with filtered as materialized (
      select s.*
      from public.servicos s
      where s.empresa_id = v_empresa
        and (
          coalesce(trim(p_search), '') = '' or
          concat_ws(' ', s.nome, s.categoria, s.descricao)
            ilike '%' || trim(p_search) || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by ativo desc, nome, id
      limit v_size
      offset v_offset
    )
    select jsonb_build_object(
      'page', v_page,
      'pageSize', v_size,
      'total', (select count(*)::int from filtered),
      'items', coalesce(
        (select jsonb_agg(to_jsonb(s) order by s.ativo desc, s.nome, s.id) from paged s),
        '[]'::jsonb
      ),
      'metrics', jsonb_build_object(
        'total', (
          select count(*)::int from public.servicos s where s.empresa_id = v_empresa
        ),
        'active', (
          select count(*)::int
          from public.servicos s
          where s.empresa_id = v_empresa and s.ativo
        ),
        'averagePrice', coalesce((
          select avg(s.preco) from public.servicos s where s.empresa_id = v_empresa
        ), 0),
        'secondary', coalesce((
          select round(avg(s.duracao))::int
          from public.servicos s
          where s.empresa_id = v_empresa
        ), 0)
      )
    )
  );
end;
$body$;

revoke all on function public.inventory_page(integer,integer,text,text,text) from public;
grant execute on function public.inventory_page(integer,integer,text,text,text) to authenticated;

revoke all on function public.catalog_page(boolean,integer,integer,text) from public;
grant execute on function public.catalog_page(boolean,integer,integer,text) to authenticated;


