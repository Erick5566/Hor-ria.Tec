-- Aviso automático de retirada: apenas Plus, opt-in documentado por OS
-- e WhatsApp Business habilitado pela assistência. Sem envio em migração.
begin;

alter table public.ordens_servico
  add column if not exists aviso_whatsapp_autorizado boolean not null default false;

-- O funcionário registra a autorização informada pelo cliente no recebimento.
-- Sem autorização, não há criação de mensagem automática.
create or replace function public.configurar_aviso_whatsapp_ordem(p_ordem uuid,p_autorizado boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  o public.ordens_servico;
begin
  if p_ordem is null or p_autorizado is null then
    raise exception 'Informe a OS e a autorização';
  end if;
  select * into o from public.ordens_servico where id=p_ordem for update;
  if not found or not private.can_access_company(o.empresa_id)
    or not private.company_operational(o.empresa_id) then
    raise exception 'OS não encontrada ou sem autorização';
  end if;
  if o.status not in ('novo','recebido') then
    raise exception 'A autorização deve ser registrada antes do reparo';
  end if;
  if p_autorizado and not exists (
    select 1 from public.assinaturas a
    join public.planos p on p.id=a.plano_id
    where a.empresa_id=o.empresa_id
      and a.status in ('TRIAL','ACTIVE')
      and p.codigo='HORARIA_PRO'
  ) then
    raise exception 'Aviso automático disponível somente para Horária Plus';
  end if;
  update public.ordens_servico set aviso_whatsapp_autorizado=p_autorizado
  where id=o.id;
  return true;
end $$;

revoke all on function public.configurar_aviso_whatsapp_ordem(uuid,boolean)
  from public,anon;
grant execute on function public.configurar_aviso_whatsapp_ordem(uuid,boolean)
  to authenticated;

-- Checagem na fonte: a mudança de status apenas enfileira quando
-- o cliente autorizou, a empresa é Plus e o canal oficial está habilitado.
create or replace function private.enfileirar_notificacao_ordem()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  c public.clientes;
  eq public.equipamentos;
begin
  if new.status <> 'pronto_retirada'
    or old.status is not distinct from new.status
    or new.aviso_whatsapp_autorizado is not true then
    return new;
  end if;

  if not private.feature_enabled(new.empresa_id,'whatsappEnabled')
    or not exists (
      select 1 from public.assinaturas a
      join public.planos p on p.id=a.plano_id
      where a.empresa_id=new.empresa_id and a.status in ('TRIAL','ACTIVE')
        and p.codigo='HORARIA_PRO'
    ) then
    return new;
  end if;

  select * into c from public.clientes where id=new.cliente_id and empresa_id=new.empresa_id;
  select * into eq from public.equipamentos where id=new.equipamento_id and empresa_id=new.empresa_id;
  if c.id is null or eq.id is null then return new; end if;

  insert into public.notificacoes(
    empresa_id,ordem_id,evento,chave_idempotencia,
    destinatario,mensagem,payload
  ) values (
    new.empresa_id,new.id,'pronto_retirada',
    'ordem:'||new.id||':pronto_retirada',
    c.whatsapp,
    'Olá, '||c.nome||'. Seu '||
      trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo))||
      ' já está pronto para retirada.',
    jsonb_build_object(
      'token',new.token_acompanhamento,
      'numero',new.numero,
      'cliente',c.nome,
      'equipamento',trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)),
      'readyConsent',true
    )
  ) on conflict(chave_idempotencia) do nothing;
  return new;
end $$;

-- Consulta mínima de status, para equipe acompanhar sem acesso ao payload,
-- ao telefone do cliente ou a outras empresas.
create or replace function public.status_aviso_whatsapp_ordem(p_ordem uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  o public.ordens_servico;
  n public.notificacoes;
  v_plus boolean;
begin
  select * into o from public.ordens_servico where id=p_ordem;
  if p_ordem is null or o.id is null or not private.can_access_company(o.empresa_id)
    then raise exception 'OS não encontrada'; end if;

  select exists(
    select 1 from public.assinaturas a
    join public.planos p on p.id=a.plano_id
    where a.empresa_id=o.empresa_id and a.status in ('TRIAL','ACTIVE')
      and p.codigo='HORARIA_PRO'
  ) into v_plus;

  select * into n from public.notificacoes
    where ordem_id=o.id and empresa_id=o.empresa_id
      and evento='pronto_retirada'
    order by criado_em desc limit 1;

  return jsonb_build_object(
    'eligiblePlan',v_plus,
    'authorized',o.aviso_whatsapp_autorizado,
    'channelEnabled',private.feature_enabled(o.empresa_id,'whatsappEnabled'),
    'deliveryStatus',n.status,
    'sentAt',n.enviado_em,
    'hasNotification',n.id is not null
  );
end $$;
revoke all on function public.status_aviso_whatsapp_ordem(uuid) from public,anon;
grant execute on function public.status_aviso_whatsapp_ordem(uuid) to authenticated;

commit;
