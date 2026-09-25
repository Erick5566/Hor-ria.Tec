create or replace function public.team_members_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_actor_role text;
  v_result jsonb;
begin
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

  select jsonb_build_object(
    'actorRole', v_actor_role,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', m.usuario_id,
          'name', coalesce(p.nome, ''),
          'email', coalesce(p.email, ''),
          'role', m.role,
          'status', m.status,
          'lastAccessAt', m.ultimo_acesso_em,
          'createdAt', m.criado_em,
          'isCurrentUser', m.usuario_id = auth.uid()
        )
        order by
          case m.role
            when 'OWNER' then 1
            when 'ADMIN' then 2
            when 'TECHNICIAN' then 3
            else 4
          end,
          coalesce(p.nome, p.email, m.usuario_id::text)
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.empresa_membros m
  left join public.perfis p on p.usuario_id = m.usuario_id
  where m.empresa_id = v_empresa;

  return v_result;
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

  update public.empresa_membros
  set role = p_role,
      status = p_status,
      atualizado_em = now()
  where empresa_id = v_empresa
    and usuario_id = p_user;
end
$function$;

revoke all on function public.team_members_data() from public, anon;
revoke all on function public.update_team_member_access(uuid,text,text) from public, anon;
grant execute on function public.team_members_data() to authenticated;
grant execute on function public.update_team_member_access(uuid,text,text) to authenticated;
