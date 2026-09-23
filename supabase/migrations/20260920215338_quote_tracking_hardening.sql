
-- Detailed quote hardening and public tracking/quote-response rate limits.

create table if not exists public.public_action_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null check (length(ip_hash) between 32 and 128),
  resource_hash text not null check (length(resource_hash) between 32 and 128),
  action text not null check (action in ('lookup','respond')),
  criado_em timestamptz not null default now()
);

alter table public.public_action_rate_limits enable row level security;

create index if not exists public_action_rate_limits_ip_action_created_idx
  on public.public_action_rate_limits(ip_hash, action, criado_em desc);

create index if not exists public_action_rate_limits_resource_created_idx
  on public.public_action_rate_limits(resource_hash, action, criado_em desc);

create or replace function public.consume_public_action_rate_limit(
  p_ip_hash text,
  p_resource_hash text,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  per_resource integer;
  per_ip integer;
  resource_limit integer;
  ip_limit integer;
begin
  if p_ip_hash is null or length(p_ip_hash) not between 32 and 128 then
    return false;
  end if;
  if p_resource_hash is null or length(p_resource_hash) not between 32 and 128 then
    return false;
  end if;
  if p_action not in ('lookup','respond') then
    return false;
  end if;

  resource_limit := case when p_action='respond' then 5 else 10 end;
  ip_limit := case when p_action='respond' then 12 else 30 end;

  perform pg_advisory_xact_lock(
    hashtextextended(p_ip_hash || ':' || p_resource_hash || ':' || p_action, 0)
  );

  delete from public.public_action_rate_limits
  where ip_hash = p_ip_hash
    and criado_em < now() - interval '24 hours';

  select count(*) into per_resource
  from public.public_action_rate_limits
  where ip_hash = p_ip_hash
    and resource_hash = p_resource_hash
    and action = p_action
    and criado_em > now() - interval '10 minutes';

  if per_resource >= resource_limit then
    return false;
  end if;

  select count(*) into per_ip
  from public.public_action_rate_limits
  where ip_hash = p_ip_hash
    and action = p_action
    and criado_em > now() - interval '10 minutes';

  if per_ip >= ip_limit then
    return false;
  end if;

  insert into public.public_action_rate_limits(ip_hash, resource_hash, action)
  values (p_ip_hash, p_resource_hash, p_action);

  return true;
end
$function$;

revoke all on table public.public_action_rate_limits from public, anon, authenticated;
revoke execute on function public.consume_public_action_rate_limit(text,text,text)
  from public, anon, authenticated;
grant execute on function public.consume_public_action_rate_limit(text,text,text)
  to service_role;

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

  select coalesce(max(versao),0)+1 into v
  from public.orcamentos
  where ordem_id=p_ordem;

  insert into public.orcamentos(
    empresa_id,ordem_id,versao,servicos,pecas,
    mao_obra,desconto,total,validade,status
  )
  values(
    o.empresa_id,o.id,v,p_servicos,p_pecas,
    round(p_mao_obra,2),round(p_desconto,2),soma,p_validade,'enviado'
  )
  returning id into q;

  update public.ordens_servico
  set status='aguardando_aprovacao'
  where id=o.id;

  return q;
end
$function$;

create or replace function public.enviar_orcamento(p_orcamento uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  q public.orcamentos;
begin
  perform 1
  from public.ordens_servico
  where id=(select ordem_id from public.orcamentos where id=p_orcamento)
  for update;

  select * into strict q
  from public.orcamentos
  where id=p_orcamento
  for update;

  if not private.can_manage_company(q.empresa_id) then
    raise exception 'Orçamento não autorizado';
  end if;

  if exists(
       select 1 from public.ordens_servico
       where id=q.ordem_id and empresa_id=q.empresa_id
         and status in ('finalizado','cancelado')
     )
     or q.status<>'rascunho'
     or q.validade<current_date
     or exists(
       select 1 from public.orcamentos
       where ordem_id=q.ordem_id and versao>q.versao
     ) then
    raise exception 'Este orçamento não pode ser enviado';
  end if;

  update public.orcamentos set status='enviado' where id=q.id;
  update public.ordens_servico
  set status='aguardando_aprovacao'
  where id=q.ordem_id and empresa_id=q.empresa_id;
end
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
       select 1 from public.orcamentos
       where ordem_id=q.ordem_id and versao>q.versao
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
       select 1 from public.orcamentos
       where ordem_id=q.ordem_id and versao>q.versao
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
       and not exists(
         select 1 from public.orcamentos newer
         where newer.ordem_id=o.id and newer.versao>q.versao
       )
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
       and not exists(
         select 1 from public.orcamentos newer
         where newer.ordem_id=o.id and newer.versao>q.versao
       )
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

grant execute on function public.consume_public_action_rate_limit(text,text,text)
  to service_role;
grant execute on function public.acompanhar_por_token(uuid) to service_role;
grant execute on function public.consultar_reparo(text,text) to service_role;
grant execute on function public.responder_orcamento_link(uuid,text,text,uuid)
  to service_role;
grant execute on function public.responder_orcamento(uuid,text,text,text,text)
  to service_role;
