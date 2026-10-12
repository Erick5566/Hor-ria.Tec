-- Horária IA: unidade pré-paga equivale a UMA resposta do modelo.
-- Sem saldo, nenhuma chamada ao provedor pode ser iniciada.
-- Esta migração não altera preços, assinaturas, PIX nem libera IA/WhatsApp.
begin;

create table private.ai_credit_wallets (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  available_units integer not null default 0 check(available_units >= 0),
  consumed_units integer not null default 0 check(consumed_units >= 0),
  updated_at timestamptz not null default now()
);
create table private.ai_credit_topups (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  units integer not null check(units between 1 and 100000),
  external_reference text not null unique check(length(external_reference) between 8 and 150),
  authorized_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table private.ai_message_reservations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  channel text not null check(channel = 'web'),
  status text not null default 'RESERVED' check(status in ('RESERVED','SETTLED','REFUNDED')),
  reserved_at timestamptz not null default now(),
  settled_at timestamptz
);
create index ai_message_reservations_company_recent
  on private.ai_message_reservations(empresa_id,reserved_at desc);
alter table private.ai_credit_wallets enable row level security;
alter table private.ai_credit_topups enable row level security;
alter table private.ai_message_reservations enable row level security;
revoke all on private.ai_credit_wallets, private.ai_credit_topups,
  private.ai_message_reservations from public,anon,authenticated;

-- Consulta pode ser feita pela pessoa logada da própria empresa.
create function public.ai_credit_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company uuid;
begin
  select m.empresa_id into v_company
  from public.empresa_membros m
  where m.usuario_id=auth.uid() and m.status='ACTIVE'
  order by case when m.role='OWNER' then 0 else 1 end limit 1;
  if v_company is null then raise exception 'Sem acesso à assistência'; end if;
  return jsonb_build_object(
    'availableUnits',coalesce((select w.available_units from private.ai_credit_wallets w where w.empresa_id=v_company),0),
    'consumedUnits',coalesce((select w.consumed_units from private.ai_credit_wallets w where w.empresa_id=v_company),0),
    'unit','uma resposta de IA', 'whatsappIncluded',false);
end $$;
revoke all on function public.ai_credit_status() from public,anon;
grant execute on function public.ai_credit_status() to authenticated;

-- Apenas o ADM autenticado com MFA credita após verificar o pagamento.
-- Não faz parte do webhook PIX nem da renovação da assinatura.
create function public.admin_add_ai_credits(p_empresa uuid,p_units integer,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_remaining integer; v_ref text := trim(coalesce(p_reference,''));
begin
  perform private.require_super_admin();
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'MFA obrigatória para créditos de IA';
  end if;
  if p_empresa is null or p_units is null or p_units not between 1 and 100000
    or length(v_ref) not between 8 and 150 then
    raise exception 'Confirmação de créditos inválida';
  end if;
  perform 1 from public.empresas where id=p_empresa for update;
  if not found then raise exception 'Empresa não encontrada'; end if;
  insert into private.ai_credit_topups(empresa_id,units,external_reference,authorized_by)
  values(p_empresa,p_units,v_ref,auth.uid());
  insert into private.ai_credit_wallets(empresa_id,available_units)
  values(p_empresa,p_units)
  on conflict(empresa_id) do update
    set available_units=private.ai_credit_wallets.available_units + excluded.available_units,
        updated_at=now()
  returning available_units into v_remaining;
  insert into public.admin_audit_logs(actor_user_id,action,empresa_id,motivo,detalhes)
  values(auth.uid(),'AI_CREDIT_TOPUP',p_empresa,v_ref,
         jsonb_build_object('units',p_units,'availableUnits',v_remaining));
  return jsonb_build_object('availableUnits',v_remaining,'addedUnits',p_units);
end $$;
revoke all on function public.admin_add_ai_credits(uuid,integer,text) from public,anon;
grant execute on function public.admin_add_ai_credits(uuid,integer,text) to authenticated;

-- Chamado SOMENTE pelo servidor com service_role após validar o token e permissões.
-- Atualização atômica: não permite consumo sem unidades já pagas.
create function public.ai_reserve_message(p_empresa uuid,p_actor uuid,p_channel text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_channel <> 'web' or p_empresa is null or p_actor is null then
    raise exception 'Canal não habilitado';
  end if;
  if not exists (
    select 1 from public.empresa_membros m
    where m.empresa_id=p_empresa and m.usuario_id=p_actor and m.status='ACTIVE'
      and private.company_operational(m.empresa_id)
  ) then raise exception 'Funcionário ou empresa sem acesso'; end if;
  update private.ai_credit_wallets
  set available_units=available_units-1,updated_at=now()
  where empresa_id=p_empresa and available_units>0;
  if not found then raise exception 'Créditos de IA insuficientes'; end if;
  insert into private.ai_message_reservations(empresa_id,actor_id,channel)
  values(p_empresa,p_actor,p_channel) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.ai_reserve_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ai_reserve_message(uuid,uuid,text) to service_role;

create function public.ai_finalize_message(p_reservation uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_company uuid;
begin
  if p_reservation is null or p_success is null then raise exception 'Resultado inválido'; end if;
  update private.ai_message_reservations
    set status=case when p_success then 'SETTLED' else 'REFUNDED' end,
        settled_at=now()
  where id=p_reservation and status='RESERVED'
  returning empresa_id into v_company;
  if not found then return false; end if;
  if p_success then
    update private.ai_credit_wallets set consumed_units=consumed_units+1,updated_at=now()
    where empresa_id=v_company;
  else
    update private.ai_credit_wallets set available_units=available_units+1,updated_at=now()
    where empresa_id=v_company;
  end if;
  return true;
end $$;
revoke all on function public.ai_finalize_message(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ai_finalize_message(uuid,boolean) to service_role;

-- Recupera reservas abandonadas por falha de processo, mantendo a operação idempotente.
create function public.ai_refund_stale_messages(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with refunded as (
    update private.ai_message_reservations
    set status='REFUNDED',settled_at=now()
    where empresa_id=p_empresa and status='RESERVED'
      and reserved_at < now()-interval '10 minutes'
    returning id
  )
  select count(*) into v_count from refunded;
  if v_count>0 then
    update private.ai_credit_wallets
    set available_units=available_units+v_count,updated_at=now()
    where empresa_id=p_empresa;
  end if;
  return v_count;
end $$;
revoke all on function public.ai_refund_stale_messages(uuid) from public,anon,authenticated;
grant execute on function public.ai_refund_stale_messages(uuid) to service_role;
commit;
