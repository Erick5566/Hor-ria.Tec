begin;

create or replace function public.link_team_member(
  p_actor uuid,
  p_target uuid,
  p_name text,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_actor_role text;
  v_existing_role text;
  v_existing_status text;
  v_other_active uuid;
begin
  if p_actor is null or p_target is null or p_actor = p_target then
    raise exception 'Membro inválido';
  end if;

  if p_role not in ('ADMIN','TECHNICIAN','ATTENDANT') then
    raise exception 'Função inválida';
  end if;

  if length(trim(coalesce(p_name, ''))) not between 2 and 100 then
    raise exception 'Informe o nome do funcionário';
  end if;

  if lower(trim(coalesce(p_email, ''))) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Informe um e-mail válido';
  end if;

  if not exists(
    select 1
    from public.perfis p
    where p.usuario_id = p_target
      and lower(coalesce(p.email, '')) = lower(trim(p_email))
  ) then
    raise exception 'Usuário de convite inválido';
  end if;

  select m.empresa_id, m.role
    into v_empresa, v_actor_role
  from public.empresa_membros m
  where m.usuario_id = p_actor
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','ADMIN')
    and private.company_operational(m.empresa_id)
  order by case m.role when 'OWNER' then 1 else 2 end
  limit 1;

  if v_empresa is null then
    raise exception 'Sem permissão para administrar a equipe';
  end if;

  if v_actor_role = 'ADMIN' and p_role = 'ADMIN' then
    raise exception 'Somente o proprietário pode adicionar administradores';
  end if;

  select m.role, m.status
    into v_existing_role, v_existing_status
  from public.empresa_membros m
  where m.empresa_id = v_empresa
    and m.usuario_id = p_target;

  if v_existing_role = 'OWNER' then
    raise exception 'O proprietário já pertence à equipe';
  end if;

  if v_existing_status = 'ACTIVE' then
    raise exception 'Este e-mail já faz parte da equipe';
  end if;

  select m.empresa_id
    into v_other_active
  from public.empresa_membros m
  where m.usuario_id = p_target
    and m.status = 'ACTIVE'
    and m.empresa_id <> v_empresa
  limit 1;

  if v_other_active is not null then
    raise exception 'Este e-mail já está vinculado a outra assistência';
  end if;

  insert into public.perfis(usuario_id, nome, email)
  values(p_target, trim(p_name), lower(trim(p_email)))
  on conflict(usuario_id) do update
    set nome = case
          when nullif(trim(public.perfis.nome), '') is null
            then excluded.nome
          else public.perfis.nome
        end,
        email = case
          when nullif(trim(public.perfis.email), '') is null
            then excluded.email
          else public.perfis.email
        end,
        atualizado_em = now();

  insert into public.empresa_membros(
    empresa_id,
    usuario_id,
    role,
    status
  )
  values(
    v_empresa,
    p_target,
    p_role,
    'ACTIVE'
  )
  on conflict(empresa_id, usuario_id) do update
    set role = excluded.role,
        status = 'ACTIVE',
        atualizado_em = now();

  return jsonb_build_object(
    'empresaId', v_empresa,
    'userId', p_target,
    'role', p_role,
    'reactivated', v_existing_status = 'INACTIVE'
  );
end
$function$;

create or replace function public.update_team_member_access(
  p_user uuid,
  p_role text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_actor_role text;
  v_target_role text;
  v_other_active uuid;
begin
  if p_role not in ('ADMIN','TECHNICIAN','ATTENDANT') then
    raise exception 'Função inválida';
  end if;

  if p_status not in ('ACTIVE','INACTIVE') then
    raise exception 'Status inválido';
  end if;

  select m.empresa_id, m.role
    into v_empresa, v_actor_role
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','ADMIN')
    and private.company_operational(m.empresa_id)
  order by case m.role when 'OWNER' then 1 else 2 end
  limit 1;

  if v_empresa is null then
    raise exception 'Sem permissão para administrar a equipe';
  end if;

  if p_user = auth.uid() then
    raise exception 'Você não pode alterar o próprio acesso por esta tela';
  end if;

  select m.role
    into v_target_role
  from public.empresa_membros m
  where m.empresa_id = v_empresa
    and m.usuario_id = p_user
  for update;

  if v_target_role is null then
    raise exception 'Membro não encontrado';
  end if;

  if v_target_role = 'OWNER' then
    raise exception 'O acesso do proprietário não pode ser alterado';
  end if;

  if v_actor_role = 'ADMIN' and (v_target_role = 'ADMIN' or p_role = 'ADMIN') then
    raise exception 'Somente o proprietário pode administrar outros administradores';
  end if;

  if p_status = 'ACTIVE' then
    select m.empresa_id
      into v_other_active
    from public.empresa_membros m
    where m.usuario_id = p_user
      and m.status = 'ACTIVE'
      and m.empresa_id <> v_empresa
    limit 1;

    if v_other_active is not null then
      raise exception 'Este usuário já está ativo em outra assistência';
    end if;
  end if;

  update public.empresa_membros
  set role = p_role,
      status = p_status,
      atualizado_em = now()
  where empresa_id = v_empresa
    and usuario_id = p_user;
end
$function$;

revoke all on function public.link_team_member(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.link_team_member(uuid,uuid,text,text,text)
  to service_role;

revoke all on function public.update_team_member_access(uuid,text,text)
  from public, anon;
grant execute on function public.update_team_member_access(uuid,text,text)
  to authenticated;

commit;