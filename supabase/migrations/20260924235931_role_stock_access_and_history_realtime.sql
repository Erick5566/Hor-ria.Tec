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
as $function$
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
    and m.role in ('OWNER','ADMIN','TECHNICIAN')
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    else 3
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
        and private.feature_enabled(v_empresa, 'stockEnabled')
        and (
          coalesce(trim(p_search), '') = '' or
          concat_ws(' ', p.nome, p.compatibilidade, p.sku, p.codigo_barras, p.categoria)
            ilike '%' || trim(p_search) || '%'
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
        and private.feature_enabled(v_empresa, 'stockEnabled')
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
end
$function$;

create or replace function public.movimentar_estoque(
  p_peca uuid,
  p_quantidade integer,
  p_motivo text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  p public.pecas;
  nova_quantidade integer;
begin
  select *
    into strict p
  from public.pecas
  where id = p_peca
  for update;

  if not private.has_company_role(
    p.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(p.empresa_id)
    or not private.feature_enabled(p.empresa_id, 'stockEnabled')
  then
    raise exception 'Item não autorizado';
  end if;

  if p_quantidade is null or p_quantidade = 0 or abs(p_quantidade) > 100000 then
    raise exception 'Quantidade inválida';
  end if;

  if length(trim(coalesce(p_motivo,''))) not between 2 and 200 then
    raise exception 'Informe o motivo da movimentação';
  end if;

  nova_quantidade := p.quantidade + p_quantidade;
  if nova_quantidade < 0 then
    raise exception 'Estoque insuficiente. Disponível: %', p.quantidade;
  end if;

  perform set_config('horaria.motivo_estoque', trim(p_motivo), true);
  update public.pecas set quantidade = nova_quantidade where id = p.id;
  perform set_config('horaria.motivo_estoque', '', true);

  return nova_quantidade;
end
$function$;

drop policy if exists tenant_member_select on public.pecas;
drop policy if exists pecas_operational_select on public.pecas;
create policy pecas_operational_select
on public.pecas
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.feature_enabled(empresa_id, 'stockEnabled')
);

drop policy if exists tenant_member_select on public.movimentos_estoque;
drop policy if exists movimentos_estoque_operational_select on public.movimentos_estoque;
create policy movimentos_estoque_operational_select
on public.movimentos_estoque
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.feature_enabled(empresa_id, 'stockEnabled')
);

alter publication supabase_realtime add table public.historico_os;
