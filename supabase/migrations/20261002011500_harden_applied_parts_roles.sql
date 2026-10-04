-- Alinha as operações de peças aplicadas aos papéis operacionais definidos
-- pela Horária. Evita que atendentes consultem custos/estoque por RPC e
-- permite que técnicos usem peças no reparo sem depender do antigo dono_id.
begin;

create or replace function public.applied_parts_options(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
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
    raise exception 'Sem permissão para consultar peças aplicadas';
  end if;

  if not exists (
    select 1
    from public.ordens_servico o
    where o.id = p_order
      and o.empresa_id = v_empresa
  ) then
    raise exception 'Ordem inválida';
  end if;

  return jsonb_build_object(
    'applied', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.criado_em desc)
      from public.pecas_aplicadas a
      where a.empresa_id = v_empresa
        and a.ordem_id = p_order
    ), '[]'::jsonb),
    'stock', case
      when private.feature_enabled(v_empresa, 'stockEnabled') then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'nome', p.nome,
            'quantidade', p.quantidade,
            'custo', p.custo,
            'preco', p.preco
          )
          order by p.nome
        )
        from public.pecas p
        where p.empresa_id = v_empresa
          and p.ativo
          and p.quantidade > 0
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end
$function$;

create or replace function public.registrar_peca_aplicada_valores(
  p_ordem uuid,
  p_nome text,
  p_quantidade integer,
  p_peca uuid default null,
  p_custo_unitario numeric default null,
  p_valor_venda_unitario numeric default null,
  p_mao_obra numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  p public.pecas;
  id_novo uuid;
  nome_final text;
  custo_final numeric;
  venda_final numeric;
begin
  select *
    into strict o
  from public.ordens_servico
  where id = p_ordem
  for update;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if o.status in ('finalizado','cancelado') then
    raise exception 'Ordem encerrada';
  end if;

  if p_quantidade is null or p_quantidade not between 1 and 1000 then
    raise exception 'Quantidade inválida';
  end if;

  if coalesce(p_mao_obra, 0) < 0 then
    raise exception 'Mão de obra inválida';
  end if;

  nome_final := trim(coalesce(p_nome, ''));
  custo_final := coalesce(p_custo_unitario, 0);
  venda_final := coalesce(p_valor_venda_unitario, 0);

  if p_peca is not null then
    if not private.feature_enabled(o.empresa_id, 'stockEnabled') then
      raise exception 'Estoque indisponível';
    end if;

    select *
      into strict p
    from public.pecas
    where id = p_peca
      and empresa_id = o.empresa_id
      and ativo
    for update;

    if p.quantidade < p_quantidade then
      raise exception 'Quantidade indisponível no estoque';
    end if;

    if length(nome_final) < 2 then
      nome_final := p.nome;
    end if;

    custo_final := coalesce(p_custo_unitario, p.custo);
    venda_final := coalesce(p_valor_venda_unitario, p.preco);

    perform set_config('horaria.ordem_estoque', o.id::text, true);
    perform set_config('horaria.motivo_estoque', 'Uso na OS #' || o.numero, true);
    update public.pecas
    set quantidade = quantidade - p_quantidade
    where id = p.id;
    perform set_config('horaria.ordem_estoque', '', true);
    perform set_config('horaria.motivo_estoque', '', true);
  end if;

  if length(nome_final) not between 2 and 200
     or custo_final < 0
     or venda_final < 0 then
    raise exception 'Valores da peça inválidos';
  end if;

  insert into public.pecas_aplicadas(
    empresa_id,
    ordem_id,
    peca_id,
    nome,
    quantidade,
    custo_unitario,
    valor_venda_unitario,
    mao_obra
  )
  values(
    o.empresa_id,
    o.id,
    p_peca,
    nome_final,
    p_quantidade,
    custo_final,
    venda_final,
    coalesce(p_mao_obra, 0)
  )
  returning id into id_novo;

  if p_peca is null then
    insert into public.historico_os(
      empresa_id,
      ordem_id,
      evento,
      detalhes,
      usuario_id,
      autor
    )
    values(
      o.empresa_id,
      o.id,
      'Peça aplicada',
      nome_final || ' · ' || p_quantidade || ' unidade(s)',
      auth.uid(),
      'Equipe técnica'
    );
  end if;

  return id_novo;
end
$function$;

create or replace function public.registrar_peca_aplicada(
  p_ordem uuid,
  p_nome text,
  p_quantidade integer,
  p_peca uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  p public.pecas;
  id_novo uuid;
  nome_final text;
begin
  select *
    into strict o
  from public.ordens_servico
  where id = p_ordem
  for update;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if o.status in ('finalizado','cancelado') then
    raise exception 'Ordem encerrada';
  end if;

  if p_quantidade is null or p_quantidade not between 1 and 1000 then
    raise exception 'Quantidade inválida';
  end if;

  nome_final := trim(coalesce(p_nome, ''));

  if p_peca is not null then
    if not private.feature_enabled(o.empresa_id, 'stockEnabled') then
      raise exception 'Estoque indisponível';
    end if;

    select *
      into strict p
    from public.pecas
    where id = p_peca
      and empresa_id = o.empresa_id
      and ativo
    for update;

    if p.quantidade < p_quantidade then
      raise exception 'Quantidade indisponível no estoque';
    end if;

    if length(nome_final) < 2 then
      nome_final := p.nome;
    end if;

    perform set_config('horaria.ordem_estoque', o.id::text, true);
    perform set_config('horaria.motivo_estoque', 'Uso na OS #' || o.numero, true);
    update public.pecas
    set quantidade = quantidade - p_quantidade
    where id = p.id;
    perform set_config('horaria.ordem_estoque', '', true);
    perform set_config('horaria.motivo_estoque', '', true);
  end if;

  if length(nome_final) not between 2 and 200 then
    raise exception 'Informe a peça utilizada';
  end if;

  insert into public.pecas_aplicadas(
    empresa_id,
    ordem_id,
    peca_id,
    nome,
    quantidade
  )
  values(
    o.empresa_id,
    o.id,
    p_peca,
    nome_final,
    p_quantidade
  )
  returning id into id_novo;

  if p_peca is null then
    insert into public.historico_os(
      empresa_id,
      ordem_id,
      evento,
      detalhes,
      usuario_id,
      autor
    )
    values(
      o.empresa_id,
      o.id,
      'Peça aplicada',
      nome_final || ' · ' || p_quantidade || ' unidade(s)',
      auth.uid(),
      'Equipe técnica'
    );
  end if;

  return id_novo;
end
$function$;

create or replace function public.aplicar_peca(
  p_ordem uuid,
  p_peca uuid,
  p_quantidade integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  p public.pecas;
begin
  select *
    into strict o
  from public.ordens_servico
  where id = p_ordem
  for update;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id)
    or not private.feature_enabled(o.empresa_id, 'stockEnabled') then
    raise exception 'Ordem não autorizada';
  end if;

  if o.status in ('finalizado','cancelado') then
    raise exception 'Ordem encerrada';
  end if;

  select *
    into strict p
  from public.pecas
  where id = p_peca
    and empresa_id = o.empresa_id
    and ativo
  for update;

  if p_quantidade is null
     or p_quantidade < 1
     or p.quantidade < p_quantidade then
    raise exception 'Quantidade indisponível no estoque';
  end if;

  perform set_config('horaria.ordem_estoque', o.id::text, true);
  update public.pecas
  set quantidade = quantidade - p_quantidade
  where id = p.id;
  perform set_config('horaria.ordem_estoque', '', true);
end
$function$;

revoke all on function public.applied_parts_options(uuid)
from public, anon, authenticated;
revoke all on function public.registrar_peca_aplicada_valores(
  uuid, text, integer, uuid, numeric, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.registrar_peca_aplicada(
  uuid, text, integer, uuid
) from public, anon, authenticated;
revoke all on function public.aplicar_peca(
  uuid, uuid, integer
) from public, anon, authenticated;

grant execute on function public.applied_parts_options(uuid) to authenticated;
grant execute on function public.registrar_peca_aplicada_valores(
  uuid, text, integer, uuid, numeric, numeric, numeric
) to authenticated;
grant execute on function public.registrar_peca_aplicada(
  uuid, text, integer, uuid
) to authenticated;
grant execute on function public.aplicar_peca(
  uuid, uuid, integer
) to authenticated;

commit;
