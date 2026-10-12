begin;
create table private.team_invitations (
  token uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  email text not null,
  name text not null,
  role text not null check (role in ('ADMIN','TECHNICIAN','ATTENDANT')),
  expires_at timestamptz not null default now() + interval '48 hours',
  revoked_at timestamptz,
  accepted_at timestamptz
);
alter table private.team_invitations enable row level security;
revoke all on private.team_invitations from public,anon,authenticated;

create function public.create_team_invitation(p_name text,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company uuid; v_role text; v_token uuid; v_email text := lower(trim(p_email));
begin
  select empresa_id,role into v_company,v_role from public.empresa_membros
  where usuario_id=auth.uid() and status='ACTIVE' and role in ('OWNER','ADMIN')
    and private.company_operational(empresa_id)
  order by case role when 'OWNER' then 0 else 1 end limit 1;
  if v_company is null then raise exception 'Sem permissão para convidar'; end if;
  if p_role not in ('ADMIN','TECHNICIAN','ATTENDANT') or (v_role='ADMIN' and p_role='ADMIN') then
    raise exception 'Função não permitida'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100
    or length(coalesce(v_email,'')) > 200 or coalesce(v_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Nome ou e-mail inválido'; end if;
  perform 1 from public.empresas where id=v_company for update;
  if (select count(*) from public.empresa_membros where empresa_id=v_company and status='ACTIVE' and role<>'OWNER') >= private.team_seat_limit(v_company) then
    raise exception 'Limite de funcionários atingido'; end if;
  update private.team_invitations set revoked_at=now()
    where empresa_id=v_company and email=v_email and accepted_at is null and revoked_at is null;
  insert into private.team_invitations(empresa_id,actor_id,email,name,role)
  values(v_company,auth.uid(),v_email,trim(p_name),p_role) returning token into v_token;
  return jsonb_build_object('token',v_token,'expiresInHours',48);
end $$;

create function public.accept_team_invitation(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_inv private.team_invitations; v_email text; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre com a conta convidada'; end if;
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into v_inv from private.team_invitations where token=p_token for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at <= now()
    or v_email is null or v_email <> v_inv.email then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail'; end if;
  -- Revalida o gestor, empresa, associação e limite no instante da aceitação.
  v_result := public.link_team_member(v_inv.actor_id,auth.uid(),v_inv.name,v_inv.email,v_inv.role);
  if (v_result->>'empresaId')::uuid <> v_inv.empresa_id then
    raise exception 'Empresa do convite não está mais disponível'; end if;
  update private.team_invitations set accepted_at=now() where token=p_token;
  return jsonb_build_object('role',v_inv.role,'empresaId',v_inv.empresa_id);
end $$;

create function public.revoke_team_invitation(p_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.team_invitations i set revoked_at=now()
  where token=p_token and accepted_at is null and exists(
    select 1 from public.empresa_membros m where m.empresa_id=i.empresa_id
      and m.usuario_id=auth.uid() and m.status='ACTIVE'
      and (m.role='OWNER' or (m.role='ADMIN' and i.role<>'ADMIN')));
  if not found then raise exception 'Convite não disponível'; end if;
end $$;
create function public.list_team_invitations()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('token',i.token,'email',i.email,'role',i.role,'expiresAt',i.expires_at) order by i.expires_at desc),'[]'::jsonb)
  from private.team_invitations i where i.accepted_at is null and i.revoked_at is null and i.expires_at>now()
    and exists(select 1 from public.empresa_membros m where m.empresa_id=i.empresa_id
      and m.usuario_id=auth.uid() and m.status='ACTIVE'
      and (m.role='OWNER' or (m.role='ADMIN' and i.role<>'ADMIN')))
$$;
revoke all on function public.list_team_invitations() from public,anon;
grant execute on function public.list_team_invitations() to authenticated;
revoke all on function public.create_team_invitation(text,text,text),public.accept_team_invitation(uuid),public.revoke_team_invitation(uuid) from public,anon;
grant execute on function public.create_team_invitation(text,text,text),public.accept_team_invitation(uuid),public.revoke_team_invitation(uuid) to authenticated;
alter table public.empresas add constraint empresas_slug_not_convite check (slug <> 'convite') not valid;
create or replace function public.verificar_slug_pagina(
  p_slug text,
  p_empresa uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_available boolean;
  v_suggestion text;
begin
  if auth.uid() is null or not private.can_manage_company(p_empresa) then
    raise exception 'Empresa não autorizada';
  end if;

  if
    v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or v_slug = any(array[
      'painel','agendar','acompanhar','api','admin','login','dashboard',
      'suporte','horaria','entrar','cadastro','privacidade','termos','convite',
      'recuperar-senha','redefinir-senha','solicitacao-enviada',
      'manutencao','conta-bloqueada','seguranca','opengraph-image'
    ])
  then
    return jsonb_build_object(
      'disponivel', false,
      'sugestao', null,
      'motivo', 'invalido'
    );
  end if;

  select not exists(
    select 1
    from public.empresas e
    where e.slug = v_slug
      and e.id <> p_empresa
  )
  into v_available;

  if v_available then
    return jsonb_build_object(
      'disponivel', true,
      'sugestao', null,
      'motivo', null
    );
  end if;

  select candidate
  into v_suggestion
  from (
    select v_slug || '-' || suffix::text as candidate
    from generate_series(2, 99) as suffix
  ) options
  where not exists(
    select 1
    from public.empresas e
    where e.slug = options.candidate
  )
  limit 1;

  return jsonb_build_object(
    'disponivel', false,
    'sugestao', v_suggestion,
    'motivo', 'em_uso'
  );
end
$function$;

commit;

