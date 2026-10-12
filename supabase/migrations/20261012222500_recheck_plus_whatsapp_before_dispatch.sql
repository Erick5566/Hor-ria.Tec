-- Defesa em profundidade: o worker valida o estado real antes de acionar a Meta.
-- Migração aditiva: não cria notificações, não envia mensagens nem ativa o canal.
begin;

-- Evita que um cliente autenticado marque opt-in diretamente via PostgREST.
-- A RPC de autorização é SECURITY DEFINER e permanece a via permitida.
create or replace function private.impedir_edicao_direta_consentimento_whatsapp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated')
    and new.aviso_whatsapp_autorizado is distinct from old.aviso_whatsapp_autorizado then
    raise exception 'Use configurar_aviso_whatsapp_ordem para alterar a autorizacao do WhatsApp';
  end if;
  return new;
end $$;

drop trigger if exists proteger_consentimento_whatsapp on public.ordens_servico;
create trigger proteger_consentimento_whatsapp
before update of aviso_whatsapp_autorizado on public.ordens_servico
for each row execute function private.impedir_edicao_direta_consentimento_whatsapp();

-- O consentimento pode ser retirado a qualquer momento. Uma nova autorização,
-- porém, só pode ser registrada antes do começo efetivo do reparo.
create or replace function public.configurar_aviso_whatsapp_ordem(
  p_ordem uuid, p_autorizado boolean
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  o public.ordens_servico;
begin
  if p_ordem is null or p_autorizado is null then
    raise exception 'Informe a OS e a autorizacao';
  end if;
  select * into o from public.ordens_servico where id = p_ordem for update;
  if not found or not private.can_access_company(o.empresa_id)
    or not private.company_operational(o.empresa_id) then
    raise exception 'OS não encontrada ou sem autorização';
  end if;
  if p_autorizado and o.status not in ('novo', 'recebido') then
    raise exception 'A autorização deve ser registrada antes do reparo';
  end if;
  if p_autorizado and not exists (
    select 1 from public.assinaturas a
    join public.planos p on p.id = a.plano_id
    where a.empresa_id = o.empresa_id
      and a.status in ('TRIAL', 'ACTIVE')
      and p.codigo = 'HORARIA_PRO'
  ) then
    raise exception 'Aviso automático disponível somente para Horária Plus';
  end if;
  update public.ordens_servico
    set aviso_whatsapp_autorizado = p_autorizado
    where id = o.id;
  return true;
end $$;

revoke all on function public.configurar_aviso_whatsapp_ordem(uuid, boolean)
  from public, anon;
grant execute on function public.configurar_aviso_whatsapp_ordem(uuid, boolean)
  to authenticated;

-- RPC só para o service_role. Deve retornar FALSE se qualquer premissa
-- tiver mudado após a criação da fila (opt-out, downgrade, bloqueio,
-- canal desativado, alteração do telefone ou OS fora de pronto_retirada).
create or replace function public.validar_envio_whatsapp_pronto(p_notificacao uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.notificacoes n
    join public.ordens_servico o
      on o.id = n.ordem_id and o.empresa_id = n.empresa_id
    join public.clientes c
      on c.id = o.cliente_id and c.empresa_id = o.empresa_id
    where n.id = p_notificacao
      and n.evento = 'pronto_retirada'
      and n.canal = 'whatsapp'
      and n.status = 'processando'
      and n.payload -> 'readyConsent' = 'true'::jsonb
      and n.chave_idempotencia = 'ordem:' || o.id::text || ':pronto_retirada'
      and o.status = 'pronto_retirada'
      and o.aviso_whatsapp_autorizado is true
      and c.whatsapp = n.destinatario
      and private.company_operational(o.empresa_id)
      and private.feature_enabled(o.empresa_id, 'whatsappEnabled')
      and exists (
        select 1
        from public.assinaturas a
        join public.planos p on p.id = a.plano_id
        where a.empresa_id = o.empresa_id
          and a.status in ('TRIAL', 'ACTIVE')
          and p.codigo = 'HORARIA_PRO'
      )
  );
$$;

revoke all on function public.validar_envio_whatsapp_pronto(uuid)
  from public, anon, authenticated;
grant execute on function public.validar_envio_whatsapp_pronto(uuid)
  to service_role;

commit;
