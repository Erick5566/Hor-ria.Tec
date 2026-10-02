-- Corrige o fluxo de orçamento e restringe a bancada aos papéis técnicos.
begin;

create or replace function public.salvar_orcamento(
  p_ordem uuid,
  p_servicos jsonb,
  p_pecas jsonb,
  p_mao_obra numeric,
  p_desconto numeric,
  p_validade date
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  o public.ordens_servico;
  item jsonb;
  soma numeric := 0;
  v integer;
  q uuid;
  latest public.orcamentos;
  quantidade_txt text;
  valor_txt text;
  item_nome text;
  item_id text;
begin
  select * into strict o
  from public.ordens_servico
  where id=p_ordem
  for update;

  if not private.can_manage_company(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if o.status in ('finalizado','cancelado') then
    raise exception 'Esta ordem está encerrada';
  end if;

  if p_servicos is null or p_pecas is null
     or jsonb_typeof(p_servicos)<>'array'
     or jsonb_typeof(p_pecas)<>'array'
     or jsonb_array_length(p_servicos)+jsonb_array_length(p_pecas)>100 then
    raise exception 'Itens inválidos';
  end if;

  if p_mao_obra is null or p_desconto is null
     or p_mao_obra<0 or p_desconto<0
     or p_mao_obra>10000000 or p_desconto>10000000
     or p_validade is null
     or p_validade<current_date
     or p_validade>current_date+90 then
    raise exception 'Valores ou validade inválidos';
  end if;

  for item in select * from jsonb_array_elements(p_servicos||p_pecas) loop
    item_nome := trim(coalesce(item->>'nome',''));
    quantidade_txt := item->>'quantidade';
    valor_txt := item->>'valor';

    if length(item_nome) not between 2 and 200
       or quantidade_txt is null
       or valor_txt is null
       or quantidade_txt !~ '^[0-9]+$'
       or valor_txt !~ '^[0-9]+([.][0-9]{1,2})?$'
       or quantidade_txt::numeric not between 1 and 1000
       or valor_txt::numeric not between 0 and 10000000 then
      raise exception 'Item inválido';
    end if;

    item_id := nullif(item->>'peca_id','');
    if item_id is not null then
      if item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or not exists(
           select 1 from public.pecas
           where id=item_id::uuid and empresa_id=o.empresa_id and ativo
         ) then
        raise exception 'Peça não autorizada';
      end if;
    end if;

    item_id := nullif(item->>'servico_id','');
    if item_id is not null then
      if item_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or not exists(
           select 1 from public.servicos
           where id=item_id::uuid and empresa_id=o.empresa_id and ativo
         ) then
        raise exception 'Serviço não autorizado';
      end if;
    end if;

    soma := soma + quantidade_txt::numeric * round(valor_txt::numeric,2);
  end loop;

  soma := round(soma + round(p_mao_obra,2) - round(p_desconto,2),2);
  if soma < 0 then
    raise exception 'Desconto maior que o orçamento';
  end if;
  if soma > 10000000 then
    raise exception 'Valor total acima do limite permitido';
  end if;

  select *
    into latest
  from public.orcamentos
  where ordem_id=p_ordem
  order by versao desc
  limit 1
  for update;

  if latest.id is not null and latest.status='rascunho' then
    update public.orcamentos
    set servicos=p_servicos,
        pecas=p_pecas,
        mao_obra=round(p_mao_obra,2),
        desconto=round(p_desconto,2),
        total=soma,
        validade=p_validade
    where id=latest.id
    returning id into q;

    return q;
  end if;

  v := coalesce(latest.versao,0)+1;

  insert into public.orcamentos(
    empresa_id,ordem_id,versao,servicos,pecas,
    mao_obra,desconto,total,validade,status
  )
  values(
    o.empresa_id,o.id,v,p_servicos,p_pecas,
    round(p_mao_obra,2),round(p_desconto,2),soma,p_validade,'rascunho'
  )
  returning id into q;

  return q;
end
$function$;

create or replace function public.acompanhar_por_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
 select jsonb_build_object(
   'numero',o.numero,
   'status',o.status,
   'previsao',o.previsao,
   'empresa',e.nome,
   'problema',o.problema,
   'equipamento',jsonb_build_object(
     'categoria',case when eq.categoria='Outro'
       then coalesce(eq.tipo_personalizado,eq.categoria)
       else eq.categoria end,
     'marca',eq.marca,
     'modelo',eq.modelo
   ),
   'orcamento',(
     select jsonb_build_object(
       'id',q.id,'versao',q.versao,
       'servicos',q.servicos,'pecas',q.pecas,
       'mao_obra',q.mao_obra,'desconto',q.desconto,
       'total',q.total,'validade',q.validade,'status',q.status,
       'resposta',q.resposta,'respondido_em',q.respondido_em,
       'criado_em',q.criado_em
     )
     from public.orcamentos q
     where q.ordem_id=o.id
       and q.status<>'rascunho'
     order by q.versao desc
     limit 1
   ),
   'historico',coalesce((
     select jsonb_agg(
       jsonb_build_object(
         'evento',h.evento,
         'status',case
           when h.evento in ('Ordem criada','Status alterado') then h.detalhes
           else null
         end,
         'data',h.criado_em
       )
       order by h.criado_em
     )
     from public.historico_os h
     where h.ordem_id=o.id and h.publico
   ),'[]'::jsonb)
 )
 from public.ordens_servico o
 join public.equipamentos eq
   on eq.id=o.equipamento_id and eq.empresa_id=o.empresa_id
 join public.empresas e on e.id=o.empresa_id
 where o.token_acompanhamento=p_token
   and private.public_company_available(e.id)
$function$;

create or replace function public.consultar_reparo(
  p_codigo text,
  p_telefone text
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
 select jsonb_build_object(
   'numero',o.numero,
   'status',o.status,
   'previsao',o.previsao,
   'empresa',e.nome,
   'problema',o.problema,
   'equipamento',jsonb_build_object(
     'categoria',case when eq.categoria='Outro'
       then coalesce(eq.tipo_personalizado,eq.categoria)
       else eq.categoria end,
     'marca',eq.marca,
     'modelo',eq.modelo
   ),
   'orcamento',(
     select jsonb_build_object(
       'id',q.id,'versao',q.versao,
       'servicos',q.servicos,'pecas',q.pecas,
       'mao_obra',q.mao_obra,'desconto',q.desconto,
       'total',q.total,'validade',q.validade,'status',q.status,
       'resposta',q.resposta,'respondido_em',q.respondido_em,
       'criado_em',q.criado_em
     )
     from public.orcamentos q
     where q.ordem_id=o.id
       and q.status<>'rascunho'
     order by q.versao desc
     limit 1
   ),
   'historico',coalesce((
     select jsonb_agg(
       jsonb_build_object(
         'evento',h.evento,
         'status',case
           when h.evento in ('Ordem criada','Status alterado') then h.detalhes
           else null
         end,
         'data',h.criado_em
       )
       order by h.criado_em
     )
     from public.historico_os h
     where h.ordem_id=o.id and h.publico
   ),'[]'::jsonb)
 )
 from public.ordens_servico o
 join public.clientes c
   on c.id=o.cliente_id and c.empresa_id=o.empresa_id
 join public.equipamentos eq
   on eq.id=o.equipamento_id and eq.empresa_id=o.empresa_id
 join public.empresas e on e.id=o.empresa_id
 where length(trim(coalesce(p_codigo,'')))=16
   and o.codigo_publico=upper(trim(p_codigo))
   and c.whatsapp=regexp_replace(coalesce(p_telefone,''),'\D','','g')
   and private.public_company_available(e.id)
$function$;

create or replace function public.responder_orcamento(
  p_orcamento uuid,
  p_decisao text,
  p_observacao text default null,
  p_codigo text default null,
  p_telefone text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  q public.orcamentos;
  o public.ordens_servico;
begin
  select * into strict q
  from public.orcamentos
  where id=p_orcamento
  for update;

  select * into strict o
  from public.ordens_servico
  where id=q.ordem_id and empresa_id=q.empresa_id
  for update;

  if not private.can_manage_company(q.empresa_id)
     and not exists(
       select 1
       from public.clientes c
       where c.id=o.cliente_id
         and c.empresa_id=o.empresa_id
         and c.whatsapp=regexp_replace(coalesce(p_telefone,''),'\D','','g')
         and o.codigo_publico=upper(coalesce(p_codigo,''))
     ) then
    raise exception 'Orçamento não encontrado';
  end if;

  if p_decisao not in ('aprovado','recusado','alteracao_solicitada')
     or length(coalesce(p_observacao,''))>1000 then
    raise exception 'Resposta inválida';
  end if;

  if p_decisao='alteracao_solicitada'
     and length(trim(coalesce(p_observacao,'')))<3 then
    raise exception 'Explique a alteração desejada';
  end if;

  if q.status<>'enviado'
     or o.status in ('cancelado','finalizado')
     or exists(
       select 1 from public.orcamentos newer
       where newer.ordem_id=q.ordem_id
         and newer.versao>q.versao
         and newer.status<>'rascunho'
     ) then
    raise exception 'Este orçamento não aceita novas respostas';
  end if;

  if p_decisao='aprovado' and q.validade<current_date then
    raise exception 'Orçamento vencido. Solicite uma nova versão';
  end if;

  update public.orcamentos
  set status=p_decisao,
      resposta=nullif(trim(coalesce(p_observacao,'')),''),
      respondido_em=now()
  where id=q.id;

  update public.ordens_servico
  set status=case
    when p_decisao='aprovado' then 'orcamento_aprovado'
    else 'aguardando_orcamento'
  end
  where id=o.id and empresa_id=o.empresa_id;
end
$function$;

create or replace function public.responder_orcamento_link(
  p_orcamento uuid,
  p_decisao text,
  p_observacao text,
  p_token uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  q public.orcamentos;
  o public.ordens_servico;
begin
  select * into strict q
  from public.orcamentos
  where id=p_orcamento
  for update;

  select * into strict o
  from public.ordens_servico
  where id=q.ordem_id and empresa_id=q.empresa_id
  for update;

  if o.token_acompanhamento is distinct from p_token then
    raise exception 'Orçamento não encontrado';
  end if;

  if p_decisao not in ('aprovado','recusado','alteracao_solicitada')
     or length(coalesce(p_observacao,''))>1000 then
    raise exception 'Resposta inválida';
  end if;

  if p_decisao='alteracao_solicitada'
     and length(trim(coalesce(p_observacao,'')))<3 then
    raise exception 'Explique a alteração desejada';
  end if;

  if q.status<>'enviado'
     or o.status in ('cancelado','finalizado')
     or exists(
       select 1 from public.orcamentos newer
       where newer.ordem_id=q.ordem_id
         and newer.versao>q.versao
         and newer.status<>'rascunho'
     ) then
    raise exception 'Este orçamento não aceita novas respostas';
  end if;

  if p_decisao='aprovado' and q.validade<current_date then
    raise exception 'Orçamento vencido. Solicite uma nova versão';
  end if;

  update public.orcamentos
  set status=p_decisao,
      resposta=nullif(trim(coalesce(p_observacao,'')),''),
      respondido_em=now()
  where id=q.id;

  update public.ordens_servico
  set status=case
    when p_decisao='aprovado' then 'orcamento_aprovado'
    else 'aguardando_orcamento'
  end
  where id=o.id and empresa_id=o.empresa_id;
end
$function$;

create or replace function public.repair_bench_data()
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
    raise exception 'Sem permissão para acessar a bancada';
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
        o.atualizado_em,
        c.nome as cliente_nome,
        c.whatsapp as cliente_whatsapp,
        e.marca as equipamento_marca,
        e.modelo as equipamento_modelo,
        q.status as orcamento_status,
        q.criado_em as orcamento_criado_em,
        q.respondido_em as orcamento_respondido_em,
        h.criado_em as ultimo_contato_cliente_em
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      left join lateral (
        select
          oq.status,
          oq.criado_em,
          oq.respondido_em
        from public.orcamentos oq
        where oq.empresa_id = v_empresa
          and oq.ordem_id = o.id
        order by oq.versao desc
        limit 1
      ) q on true
      left join lateral (
        select ho.criado_em
        from public.historico_os ho
        where ho.empresa_id = v_empresa
          and ho.ordem_id = o.id
          and ho.evento = 'Retorno ao cliente'
        order by ho.criado_em desc
        limit 1
      ) h on true
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
end
$function$;

create or replace function public.mover_ordem_reparo(
  p_ordem uuid,
  p_status text,
  p_mesa uuid default null,
  p_prioridade text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  m public.mesas_reparo;
  prioridade_final text;
  autor_nome text;
begin
  select * into strict o
  from public.ordens_servico
  where id=p_ordem
  for update;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if p_status not in (
    'novo','recebido','em_diagnostico','aguardando_orcamento',
    'orcamento_enviado','aguardando_aprovacao','orcamento_aprovado',
    'em_reparo','aguardando_peca','em_testes','pronto_retirada',
    'finalizado','cancelado'
  ) then
    raise exception 'Status inválido';
  end if;

  if p_mesa is not null then
    select * into strict m
    from public.mesas_reparo
    where id=p_mesa
      and empresa_id=o.empresa_id
      and ativo;
  end if;

  prioridade_final:=coalesce(p_prioridade,o.prioridade);
  if prioridade_final not in ('baixa','normal','alta','urgente') then
    raise exception 'Prioridade inválida';
  end if;

  select coalesce(nullif(trim(nome),''),'Equipe técnica')
    into autor_nome
  from public.perfis
  where usuario_id=auth.uid();

  update public.ordens_servico
  set status=p_status,
      mesa_id=p_mesa,
      prioridade=prioridade_final,
      iniciado_em=case
        when p_status in ('em_reparo','em_testes')
          then coalesce(iniciado_em,now())
        else iniciado_em
      end
  where id=o.id;

  if o.mesa_id is distinct from p_mesa
     or o.prioridade is distinct from prioridade_final then
    insert into public.historico_os(
      empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor
    )
    values(
      o.empresa_id,
      o.id,
      'Organização da bancada',
      concat_ws(
        ' · ',
        case when p_mesa is null then 'Sem mesa' else 'Mesa: '||m.nome end,
        'Prioridade: '||prioridade_final
      ),
      false,
      auth.uid(),
      coalesce(autor_nome,'Equipe técnica')
    );
  end if;
end
$function$;

drop policy if exists tenant_member_select on public.mesas_reparo;
drop policy if exists mesas_reparo_operational_select on public.mesas_reparo;
create policy mesas_reparo_operational_select
on public.mesas_reparo
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_insert on public.mesas_reparo;
drop policy if exists mesas_reparo_manager_insert on public.mesas_reparo;
create policy mesas_reparo_manager_insert
on public.mesas_reparo
for insert
to authenticated
with check (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_update on public.mesas_reparo;
drop policy if exists mesas_reparo_manager_update on public.mesas_reparo;
create policy mesas_reparo_manager_update
on public.mesas_reparo
for update
to authenticated
using (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
)
with check (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create or replace function public.salvar_garantia(
  p_ordem uuid,
  p_descricao text,
  p_inicio date,
  p_fim date,
  p_observacoes text default null,
  p_ordem_origem uuid default null,
  p_servico uuid default null,
  p_peca_aplicada uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  id_novo uuid;
begin
  select * into strict o
  from public.ordens_servico
  where id=p_ordem;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if length(trim(coalesce(p_descricao,''))) not between 2 and 300
     or p_inicio is null
     or p_fim<p_inicio then
    raise exception 'Garantia inválida';
  end if;

  if p_ordem_origem is not null
     and not exists(
       select 1 from public.ordens_servico
       where id=p_ordem_origem and empresa_id=o.empresa_id
     ) then
    raise exception 'Ordem de origem inválida';
  end if;

  if p_servico is not null
     and not exists(
       select 1 from public.servicos
       where id=p_servico and empresa_id=o.empresa_id
     ) then
    raise exception 'Serviço inválido';
  end if;

  if p_peca_aplicada is not null
     and not exists(
       select 1 from public.pecas_aplicadas
       where id=p_peca_aplicada and empresa_id=o.empresa_id
     ) then
    raise exception 'Peça aplicada inválida';
  end if;

  insert into public.garantias(
    empresa_id,
    ordem_id,
    ordem_origem_id,
    servico_id,
    peca_aplicada_id,
    descricao,
    inicio,
    fim,
    observacoes
  )
  values(
    o.empresa_id,
    o.id,
    p_ordem_origem,
    p_servico,
    p_peca_aplicada,
    trim(p_descricao),
    p_inicio,
    p_fim,
    p_observacoes
  )
  returning id into id_novo;

  insert into public.historico_os(
    empresa_id,
    ordem_id,
    evento,
    detalhes,
    publico,
    usuario_id,
    autor
  )
  values(
    o.empresa_id,
    o.id,
    'Garantia registrada',
    trim(p_descricao)||' · até '||to_char(p_fim,'DD/MM/YYYY'),
    true,
    auth.uid(),
    'Equipe técnica'
  );

  return id_novo;
end
$function$;

drop policy if exists tenant_member_select on public.diagnosticos;
drop policy if exists diagnosticos_technical_select on public.diagnosticos;
create policy diagnosticos_technical_select
on public.diagnosticos
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_insert on public.diagnosticos;
drop policy if exists diagnosticos_technical_insert on public.diagnosticos;
create policy diagnosticos_technical_insert
on public.diagnosticos
for insert
to authenticated
with check (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_update on public.diagnosticos;
drop policy if exists diagnosticos_technical_update on public.diagnosticos;
create policy diagnosticos_technical_update
on public.diagnosticos
for update
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
)
with check (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.garantias;
drop policy if exists garantias_technical_select on public.garantias;
create policy garantias_technical_select
on public.garantias
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_insert on public.garantias;
drop policy if exists garantias_technical_insert on public.garantias;
create policy garantias_technical_insert
on public.garantias
for insert
to authenticated
with check (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_update on public.garantias;
drop policy if exists garantias_technical_update on public.garantias;
create policy garantias_technical_update
on public.garantias
for update
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
)
with check (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.orcamentos;
drop policy if exists orcamentos_manager_select on public.orcamentos;
create policy orcamentos_manager_select
on public.orcamentos
for select
to authenticated
using (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

drop policy if exists tenant_member_select on public.pecas_aplicadas;
drop policy if exists pecas_aplicadas_technical_select on public.pecas_aplicadas;
create policy pecas_aplicadas_technical_select
on public.pecas_aplicadas
for select
to authenticated
using (
  private.has_company_role(
    empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  )
  and private.company_operational(empresa_id)
  and private.feature_enabled(empresa_id, 'stockEnabled')
);

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
as $function$
declare
  v_empresa uuid;
  v_can_manage boolean := false;
  v_sort text;
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
  v_sort := case
    when p_sort = 'value' and not v_can_manage then 'recent'
    when p_sort in ('recent','oldest','value') then p_sort
    else 'recent'
  end;
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
        case when v_can_manage then q.total else null end as quote_total
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      left join lateral (
        select oc.total
        from public.orcamentos oc
        where v_can_manage
          and oc.empresa_id = v_empresa
          and oc.ordem_id = o.id
          and oc.status <> 'rascunho'
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
        case when v_sort = 'oldest' then criado_em end asc nulls last,
        case when v_sort = 'value' then quote_total end desc nulls last,
        case when v_sort = 'recent' then criado_em end desc nulls last,
        id
      limit v_size
      offset v_offset
    ),
    all_orders as materialized (
      select
        o.id,
        o.status,
        o.prioridade,
        case when v_can_manage then q.total else null end as quote_total
      from public.ordens_servico o
      left join lateral (
        select oc.total
        from public.orcamentos oc
        where v_can_manage
          and oc.empresa_id = v_empresa
          and oc.ordem_id = o.id
          and oc.status <> 'rascunho'
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
        (
          select jsonb_agg(
            to_jsonb(p)
            order by
              case when v_sort = 'oldest' then p.criado_em end asc nulls last,
              case when v_sort = 'value' then p.quote_total end desc nulls last,
              case when v_sort = 'recent' then p.criado_em end desc nulls last,
              p.id
          )
          from paged p
        ),
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
        'open', (
          select count(*)::int
          from all_orders
          where status not in ('finalizado', 'cancelado')
        ),
        'diagnostic', (
          select count(*)::int
          from all_orders
          where status in ('novo', 'recebido', 'em_diagnostico')
        ),
        'urgent', (
          select count(*)::int
          from all_orders
          where status not in ('finalizado', 'cancelado')
            and prioridade = 'urgente'
        ),
        'ready', (
          select count(*)::int
          from all_orders
          where status = 'pronto_retirada'
        ),
        'forecast', case
          when v_can_manage then coalesce((
            select sum(coalesce(quote_total, 0))
            from all_orders
            where status not in ('finalizado', 'cancelado')
          ), 0)
          else 0
        end
      )
    )
  );
end
$function$;


commit;
