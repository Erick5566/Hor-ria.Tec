create or replace function public.admin_list_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  perform private.require_super_admin();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'name', e.nome,
        'slug', e.slug,
        'responsible', coalesce(p.nome, ''),
        'email', coalesce(p.email, ''),
        'phone', e.telefone,
        'createdAt', e.criado_em,
        'plan', pl.nome,
        'subscriptionStatus', a.status,
        'trialEndsAt', a.trial_ends_at,
        'nextBillingDate', a.next_billing_date,
        'monthlyValue', coalesce(last_paid.valor, 0),
        'currency', coalesce(last_paid.moeda, 'BRL'),
        'lastAccessAt', stats.ultimo_acesso,
        'usersCount', stats.usuarios,
        'customersCount', stats.clientes,
        'ordersCount', stats.ordens,
        'storageBytes', stats.storage_bytes,
        'status', e.status,
        'maintenance', e.manutencao_ativa,
        'scheduledDeletionAt', e.scheduled_deletion_at
      )
      order by e.criado_em desc
    ),
    '[]'::jsonb
  )
  into result
  from public.empresas e
  join public.perfis p on p.usuario_id = e.dono_id
  left join public.assinaturas a on a.empresa_id = e.id
  left join public.planos pl on pl.id = a.plano_id
  left join lateral (
    select pg.valor, pg.moeda
    from public.pagamentos pg
    where pg.assinatura_id = a.id
      and pg.status = 'APPROVED'
    order by coalesce(pg.paid_at, pg.criado_em) desc
    limit 1
  ) last_paid on true
  cross join lateral (
    select
      (select max(m.ultimo_acesso_em)
       from public.empresa_membros m
       where m.empresa_id = e.id) as ultimo_acesso,
      (select count(*)
       from public.empresa_membros m
       where m.empresa_id = e.id and m.status = 'ACTIVE') as usuarios,
      (select count(*)
       from public.clientes c
       where c.empresa_id = e.id) as clientes,
      (select count(*)
       from public.ordens_servico o
       where o.empresa_id = e.id) as ordens,
      (select coalesce(
         sum(
           case
             when coalesce(s.metadata->>'size', '') ~ '^[0-9]+$'
               then (s.metadata->>'size')::bigint
             else 0
           end
         ),
         0
       )
       from storage.objects s
       where s.bucket_id = 'os-fotos'
         and s.name like e.id::text || '/%') as storage_bytes
  ) stats;

  return result;
end
$function$;

create or replace function public.admin_company_detail(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  perform private.require_super_admin();

  select jsonb_build_object(
    'id', e.id,
    'name', e.nome,
    'slug', e.slug,
    'responsible', coalesce(p.nome, ''),
    'email', coalesce(p.email, ''),
    'phone', e.telefone,
    'createdAt', e.criado_em,
    'status', e.status,
    'maintenance', e.manutencao_ativa,
    'maintenanceMessage', e.mensagem_manutencao,
    'scheduledDeletionAt', e.scheduled_deletion_at,
    'featureFlags', c.feature_flags || e.feature_flags,
    'lastAccessAt', (
      select max(m.ultimo_acesso_em)
      from public.empresa_membros m
      where m.empresa_id = e.id
    ),
    'subscription', jsonb_build_object(
      'id', a.id,
      'plan', pl.nome,
      'status', a.status,
      'startedAt', a.started_at,
      'trialEndsAt', a.trial_ends_at,
      'nextBillingDate', a.next_billing_date,
      'cancelledAt', a.cancelled_at,
      'externalId', a.external_subscription_id
    ),
    'usersCount', (
      select count(*)
      from public.empresa_membros m
      where m.empresa_id = e.id and m.status = 'ACTIVE'
    ),
    'customersCount', (
      select count(*)
      from public.clientes x
      where x.empresa_id = e.id
    ),
    'ordersCount', (
      select count(*)
      from public.ordens_servico x
      where x.empresa_id = e.id
    ),
    'note', coalesce((
      select al.detalhes->>'note'
      from public.admin_audit_logs al
      where al.empresa_id = e.id
        and al.action = 'ADMIN_NOTE'
      order by al.criado_em desc
      limit 1
    ), ''),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'provider', q.provider,
          'status', q.status,
          'value', q.valor,
          'currency', q.moeda,
          'paidAt', q.paid_at,
          'createdAt', q.criado_em
        )
        order by q.criado_em desc
      )
      from (
        select pg.id, pg.provider, pg.status, pg.valor, pg.moeda, pg.paid_at, pg.criado_em
        from public.pagamentos pg
        where pg.empresa_id = e.id
        order by pg.criado_em desc
        limit 5
      ) q
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'action', q.action,
          'reason', q.motivo,
          'createdAt', q.criado_em
        )
        order by q.criado_em desc
      )
      from (
        select al.id, al.action, al.motivo, al.criado_em
        from public.admin_audit_logs al
        where al.empresa_id = e.id
          and al.action <> 'ADMIN_NOTE'
        order by al.criado_em desc
        limit 8
      ) q
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', m.usuario_id,
          'role', m.role,
          'status', m.status,
          'lastAccessAt', m.ultimo_acesso_em,
          'name', mp.nome,
          'email', mp.email
        )
        order by m.criado_em
      )
      from public.empresa_membros m
      left join public.perfis mp on mp.usuario_id = m.usuario_id
      where m.empresa_id = e.id
    ), '[]'::jsonb)
  )
  into result
  from public.empresas e
  join public.perfis p on p.usuario_id = e.dono_id
  cross join public.configuracoes_plataforma c
  left join public.assinaturas a on a.empresa_id = e.id
  left join public.planos pl on pl.id = a.plano_id
  where e.id = p_empresa
    and c.id;

  return result;
end
$function$;

create or replace function public.admin_save_company_note(
  p_empresa uuid,
  p_note text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  created_at timestamptz;
  normalized_note text := trim(coalesce(p_note, ''));
begin
  perform private.require_super_admin();

  if not exists (
    select 1 from public.empresas e where e.id = p_empresa
  ) then
    raise exception 'Empresa não encontrada';
  end if;

  if length(normalized_note) > 4000 then
    raise exception 'A anotação deve ter no máximo 4000 caracteres';
  end if;

  insert into public.admin_audit_logs(
    actor_user_id,
    action,
    empresa_id,
    motivo,
    detalhes
  )
  values (
    auth.uid(),
    'ADMIN_NOTE',
    p_empresa,
    'Anotação interna',
    jsonb_build_object('note', normalized_note)
  )
  returning criado_em into created_at;

  return created_at;
end
$function$;

revoke all on function public.admin_save_company_note(uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_save_company_note(uuid, text)
to authenticated;
