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
        q.total as orcamento_total,
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
          oq.total,
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

commit;
