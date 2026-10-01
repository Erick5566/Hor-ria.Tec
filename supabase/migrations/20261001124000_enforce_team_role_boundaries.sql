begin;

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
as $function$
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
    and (
      not p_stock
      or m.role in ('OWNER','ADMIN','TECHNICIAN')
    )
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
          and private.feature_enabled(v_empresa, 'stockEnabled')
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
            select count(*)::int from public.pecas p
            where p.empresa_id = v_empresa
          ),
          'active', (
            select count(*)::int
            from public.pecas p
            where p.empresa_id = v_empresa and p.quantidade > 0
          ),
          'averagePrice', coalesce((
            select avg(p.preco) from public.pecas p
            where p.empresa_id = v_empresa
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
$function$;

create or replace function public.finalizar_venda(
  p_empresa uuid,
  p_cliente uuid,
  p_itens jsonb,
  p_desconto numeric,
  p_forma text,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  venda public.vendas;
  produto public.pecas;
  item jsonb;
  qtd integer;
  preco numeric;
  v_subtotal numeric := 0;
  v_custo numeric := 0;
begin
  if not private.can_manage_company(p_empresa)
    or not private.company_operational(p_empresa)
  then
    raise exception 'Somente proprietários e administradores podem finalizar vendas';
  end if;

  if not private.feature_enabled(p_empresa,'stockEnabled')
    or not private.feature_enabled(p_empresa,'financialEnabled')
  then
    raise exception 'Estoque e financeiro precisam estar ativos';
  end if;

  if p_cliente is not null
    and not exists(
      select 1
      from public.clientes
      where id=p_cliente and empresa_id=p_empresa
    )
  then
    raise exception 'Cliente inválido';
  end if;

  if p_itens is null
    or jsonb_typeof(p_itens)<>'array'
    or jsonb_array_length(p_itens) not between 1 and 100
  then
    raise exception 'Adicione ao menos um produto';
  end if;

  if coalesce(p_desconto,0)<0
    or p_forma not in ('pix','dinheiro','credito','debito','outro')
  then
    raise exception 'Pagamento inválido';
  end if;

  insert into public.vendas(
    empresa_id,cliente_id,subtotal,desconto,total,custo_total,observacoes
  )
  values(
    p_empresa,p_cliente,0,coalesce(p_desconto,0),0,0,
    nullif(trim(p_observacoes),'')
  )
  returning * into venda;

  for item in select * from jsonb_array_elements(p_itens) loop
    qtd := (item->>'quantidade')::integer;
    preco := (item->>'preco')::numeric;

    select *
      into strict produto
    from public.pecas
    where id=(item->>'peca_id')::uuid
      and empresa_id=p_empresa
      and ativo
    for update;

    if qtd not between 1 and 1000
      or preco<0
      or produto.quantidade<qtd
    then
      raise exception 'Quantidade indisponível para %',produto.nome;
    end if;

    v_subtotal := v_subtotal + qtd*preco;
    v_custo := v_custo + qtd*produto.custo;

    insert into public.venda_itens(
      empresa_id,venda_id,peca_id,nome,quantidade,custo_unitario,preco_unitario,total
    )
    values(
      p_empresa,venda.id,produto.id,produto.nome,qtd,produto.custo,preco,qtd*preco
    );

    perform set_config('horaria.venda_estoque',venda.id::text,true);
    perform set_config('horaria.motivo_estoque','Venda #'||venda.numero,true);
    update public.pecas set quantidade=quantidade-qtd where id=produto.id;
    perform set_config('horaria.venda_estoque','',true);
    perform set_config('horaria.motivo_estoque','',true);
  end loop;

  if p_desconto>v_subtotal then
    raise exception 'Desconto maior que a venda';
  end if;

  update public.vendas
  set subtotal=v_subtotal,
      desconto=p_desconto,
      total=v_subtotal-p_desconto,
      custo_total=v_custo
  where id=venda.id
  returning * into venda;

  if venda.total>0 then
    insert into public.venda_pagamentos(empresa_id,venda_id,forma,valor)
    values(p_empresa,venda.id,p_forma,venda.total);

    insert into public.financeiro(
      empresa_id,venda_id,descricao,tipo,valor,status,vencimento,pago_em,origem
    )
    values(
      p_empresa,venda.id,'Venda #'||venda.numero,'receita',venda.total,
      'pago',current_date,current_date,'loja'
    );
  end if;

  return jsonb_build_object(
    'id',venda.id,
    'numero',venda.numero,
    'total',venda.total,
    'custo',venda.custo_total,
    'lucro',venda.total-venda.custo_total
  );
end
$function$;

create or replace function public.vender_seminovo(
  p_seminovo uuid,
  p_comprador uuid,
  p_valor numeric,
  p_forma text,
  p_garantia_dias integer default 90
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.seminovos;
begin
  select *
    into strict s
  from public.seminovos
  where id=p_seminovo
  for update;

  if not private.can_manage_company(s.empresa_id)
    or not private.company_operational(s.empresa_id)
  then
    raise exception 'Somente proprietários e administradores podem vender seminovos';
  end if;

  if s.status not in ('pronto_venda','reservado')
    or p_valor<=0
    or p_forma not in ('pix','dinheiro','credito','debito','outro')
    or p_garantia_dias not between 0 and 730
  then
    raise exception 'Venda inválida';
  end if;

  if p_comprador is null
    or not exists(
      select 1
      from public.clientes
      where id=p_comprador and empresa_id=s.empresa_id
    )
  then
    raise exception 'Comprador inválido';
  end if;

  update public.seminovos
  set comprador_id=p_comprador,
      status='vendido',
      valor_vendido=p_valor,
      forma_pagamento=p_forma,
      garantia_fim=current_date+p_garantia_dias,
      vendido_em=now(),
      na_vitrine=false
  where id=s.id;

  insert into public.financeiro(
    empresa_id,descricao,tipo,valor,status,vencimento,pago_em,origem
  )
  values(
    s.empresa_id,
    'Venda de seminovo · '||trim(concat_ws(' ',s.marca,s.modelo)),
    'receita',p_valor,'pago',current_date,current_date,'seminovo'
  );

  insert into public.pos_venda(
    empresa_id,cliente_id,seminovo_id,tipo,disponivel_em
  )
  values(
    s.empresa_id,p_comprador,s.id,'seminovo',current_date+7
  );
end
$function$;

drop policy if exists tenant_member_select on public.vendas;
create policy vendas_manager_select
on public.vendas
for select to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.venda_itens;
create policy venda_itens_manager_select
on public.venda_itens
for select to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.venda_pagamentos;
create policy venda_pagamentos_manager_select
on public.venda_pagamentos
for select to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.seminovos;
drop policy if exists tenant_member_insert on public.seminovos;
drop policy if exists tenant_member_update on public.seminovos;

create policy seminovos_manager_select
on public.seminovos
for select to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create policy seminovos_manager_insert
on public.seminovos
for insert to authenticated
with check(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create policy seminovos_manager_update
on public.seminovos
for update to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
)
with check(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.pos_venda;
drop policy if exists tenant_member_insert on public.pos_venda;
drop policy if exists tenant_member_update on public.pos_venda;

create policy pos_venda_manager_select
on public.pos_venda
for select to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create policy pos_venda_manager_insert
on public.pos_venda
for insert to authenticated
with check(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create policy pos_venda_manager_update
on public.pos_venda
for update to authenticated
using(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
)
with check(
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create or replace function private.guard_peca_manager_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.na_vitrine is distinct from old.na_vitrine
    and auth.uid() is not null
    and not private.can_manage_company(old.empresa_id)
  then
    raise exception 'Somente proprietários e administradores podem alterar a vitrine';
  end if;
  return new;
end
$function$;

revoke all on function private.guard_peca_manager_fields()
from public,anon,authenticated;

drop trigger if exists guard_peca_manager_fields on public.pecas;
create trigger guard_peca_manager_fields
before update on public.pecas
for each row execute function private.guard_peca_manager_fields();

commit;