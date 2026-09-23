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
  v_public_credentials_valid boolean := false;
begin
  select * into strict q
  from public.orcamentos
  where id=p_orcamento
  for update;

  select * into strict o
  from public.ordens_servico
  where id=q.ordem_id and empresa_id=q.empresa_id
  for update;

  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    select exists(
      select 1
      from public.clientes c
      where c.id=o.cliente_id
        and c.empresa_id=o.empresa_id
        and c.whatsapp=regexp_replace(coalesce(p_telefone,''),'\D','','g')
        and o.codigo_publico=upper(coalesce(p_codigo,''))
    ) into v_public_credentials_valid;
  end if;

  if not private.can_manage_company(q.empresa_id)
     and not v_public_credentials_valid then
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

revoke execute on function public.responder_orcamento(uuid,text,text,text,text)
  from public, anon;
grant execute on function public.responder_orcamento(uuid,text,text,text,text)
  to authenticated, service_role;
