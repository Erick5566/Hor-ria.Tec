begin;

-- O token permanece privado; funções não revelam convites de outras assistências.
create or replace function public.team_invitation_email_context(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_inv private.team_invitations; v_company_name text;
begin
  if auth.uid() is null then raise exception 'Sessão obrigatória'; end if;
  select * into v_inv from private.team_invitations where token = p_token
    and accepted_at is null and revoked_at is null and expires_at > now();
  if not found or not exists(
    select 1 from public.empresa_membros m
    where m.usuario_id=auth.uid() and m.empresa_id=v_inv.empresa_id
      and m.status='ACTIVE' and (m.role='OWNER' or (m.role='ADMIN' and v_inv.role <> 'ADMIN'))
      and private.company_operational(m.empresa_id)
  ) then
    raise exception 'Convite não disponível ou sem permissão';
  end if;
  select e.nome into v_company_name from public.empresas e where e.id=v_inv.empresa_id;
  return jsonb_build_object(
    'email',v_inv.email,'name',v_inv.name,'role',v_inv.role,
    'companyName',coalesce(nullif(trim(v_company_name),''),'assistência técnica'),
    'expiresAt',v_inv.expires_at
  );
end $$;
revoke all on function public.team_invitation_email_context(uuid) from public,anon;
grant execute on function public.team_invitation_email_context(uuid) to authenticated;

create table private.team_invitation_email_delivery (
  token uuid primary key references private.team_invitations(token) on delete cascade,
  attempts integer not null default 0,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  last_status text not null default 'processando',
  last_provider_id text,
  last_error text
);
alter table private.team_invitation_email_delivery enable row level security;
revoke all on private.team_invitation_email_delivery from public,anon,authenticated;

-- Rate limit no banco para evitar reenvios em massa, mesmo com múltiplas invocações simultâneas.
create function public.claim_team_invitation_email_send(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_delivery private.team_invitation_email_delivery;
begin
  -- Somente service_role possui EXECUTE nesta função; SECURITY DEFINER executa como proprietário.
  perform 1 from private.team_invitations i where i.token=p_token
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    for update;
  if not found then return false; end if;
  select * into v_delivery from private.team_invitation_email_delivery where token=p_token for update;
  if found then
    if v_delivery.last_attempt_at > now()-interval '45 seconds' then return false; end if;
    if v_delivery.first_attempt_at > now()-interval '24 hours' and v_delivery.attempts >= 6 then return false; end if;
    update private.team_invitation_email_delivery
      set attempts=case when first_attempt_at < now()-interval '24 hours' then 1 else attempts+1 end,
          first_attempt_at=case when first_attempt_at < now()-interval '24 hours' then now() else first_attempt_at end,
          last_attempt_at=now(),last_status='processando',last_error=null
      where token=p_token;
  else
    insert into private.team_invitation_email_delivery(token,attempts) values (p_token,1);
  end if;
  return true;
end $$;
revoke all on function public.claim_team_invitation_email_send(uuid) from public,anon,authenticated;
grant execute on function public.claim_team_invitation_email_send(uuid) to service_role;

create function public.finish_team_invitation_email_send(
  p_token uuid, p_ok boolean, p_provider_id text default null, p_error text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Somente service_role possui EXECUTE nesta função; SECURITY DEFINER executa como proprietário.
  update private.team_invitation_email_delivery
    set last_status = case when p_ok then 'aceito_pelo_provedor' else 'falhou' end,
        last_provider_id = case when p_ok then left(p_provider_id,200) else null end,
        last_error = case when p_ok then null else left(p_error,500) end
    where token=p_token;
end $$;
revoke all on function public.finish_team_invitation_email_send(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_team_invitation_email_send(uuid,boolean,text,text) to service_role;

commit;
