alter table public.configuracoes_plataforma
  add column if not exists billing_grace_days integer not null default 3;

alter table public.configuracoes_plataforma
  drop constraint if exists configuracoes_plataforma_billing_grace_days_check;

alter table public.configuracoes_plataforma
  add constraint configuracoes_plataforma_billing_grace_days_check
  check (billing_grace_days between 0 and 30);

create or replace function private.effective_company_status(p_empresa uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when e.status in ('SUSPENDED', 'CANCELED', 'PENDING_DELETION')
      then e.status
    when a.id is null
      then 'SUSPENDED'
    when a.status = 'CANCELED'
      then 'CANCELED'
    when a.status = 'SUSPENDED'
      then 'SUSPENDED'
    when a.status = 'TRIAL' then
      case
        when a.trial_ends_at is null
          then 'SUSPENDED'
        when now() <= a.trial_ends_at
          then 'TRIAL'
        when now() <= a.trial_ends_at + make_interval(days => c.billing_grace_days)
          then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'ACTIVE' then
      case
        when a.next_billing_date is null or now() <= a.next_billing_date
          then 'ACTIVE'
        when now() <= a.next_billing_date + make_interval(days => c.billing_grace_days)
          then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'PAST_DUE' then
      case
        when now() <= coalesce(
          a.next_billing_date,
          a.trial_ends_at,
          a.atualizado_em
        ) + make_interval(days => c.billing_grace_days)
          then 'PAST_DUE'
        else 'SUSPENDED'
      end
    else e.status
  end
  from public.empresas e
  left join public.assinaturas a on a.empresa_id = e.id
  cross join public.configuracoes_plataforma c
  where e.id = p_empresa
    and c.id
$function$;

revoke all on function private.effective_company_status(uuid)
from public, anon, authenticated;

create or replace function private.company_operational(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.empresas e
    cross join public.configuracoes_plataforma c
    where e.id = p_empresa
      and private.effective_company_status(e.id) in ('TRIAL', 'ACTIVE', 'PAST_DUE')
      and not e.manutencao_ativa
      and not c.manutencao_global
  )
$function$;

create or replace function public.access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with member as (
    select
      m.*,
      e.nome,
      e.slug,
      private.effective_company_status(e.id) as empresa_status,
      e.manutencao_ativa,
      e.mensagem_manutencao,
      e.feature_flags,
      e.scheduled_deletion_at
    from public.empresa_membros m
    join public.empresas e on e.id = m.empresa_id
    where m.usuario_id = auth.uid()
      and m.status = 'ACTIVE'
    order by case m.role when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end
    limit 1
  ),
  config as (
    select *
    from public.configuracoes_plataforma
    where id
  )
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'userId', auth.uid(),
    'platformRole', coalesce(p.platform_role, 'USER'),
    'isSuperAdmin', coalesce(p.platform_role = 'SUPER_ADMIN', false),
    'globalMaintenance', config.manutencao_global,
    'maintenanceMessage', config.mensagem_manutencao,
    'registrationEnabled', config.registration_enabled,
    'maxCompanies', config.max_companies,
    'publicAppUrl', config.public_app_url,
    'company', case
      when member.empresa_id is null then null
      else jsonb_build_object(
        'id', member.empresa_id,
        'name', member.nome,
        'slug', member.slug,
        'role', member.role,
        'status', member.empresa_status,
        'maintenance', member.manutencao_ativa,
        'maintenanceMessage', member.mensagem_manutencao,
        'scheduledDeletionAt', member.scheduled_deletion_at,
        'featureFlags', config.feature_flags || member.feature_flags
      )
    end,
    'subscription', case
      when a.id is null then null
      else jsonb_build_object(
        'id', a.id,
        'status', case
          when member.empresa_status in ('PAST_DUE', 'SUSPENDED', 'CANCELED')
            then member.empresa_status
          else a.status
        end,
        'startedAt', a.started_at,
        'trialEndsAt', a.trial_ends_at,
        'nextBillingDate', a.next_billing_date,
        'cancelledAt', a.cancelled_at
      )
    end
  )
  from config
  left join public.perfis p on p.usuario_id = auth.uid()
  left join member on true
  left join public.assinaturas a on a.empresa_id = member.empresa_id
$function$;

create or replace function public.public_company_status(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'exists', true,
    'name', e.nome,
    'state', case
      when c.manutencao_global or e.manutencao_ativa
        then 'MAINTENANCE'
      when private.effective_company_status(e.id) not in ('TRIAL', 'ACTIVE', 'PAST_DUE')
        then 'UNAVAILABLE'
      else 'AVAILABLE'
    end,
    'message', case
      when e.manutencao_ativa then e.mensagem_manutencao
      when c.manutencao_global then c.mensagem_manutencao
      else null
    end
  )
  from public.empresas e
  cross join public.configuracoes_plataforma c
  where e.slug = p_slug
    and c.id
$function$;


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
        'subscriptionStatus', case
          when effective.status in ('PAST_DUE', 'SUSPENDED', 'CANCELED')
            then effective.status
          else a.status
        end,
        'trialEndsAt', a.trial_ends_at,
        'nextBillingDate', a.next_billing_date,
        'monthlyValue', coalesce(last_paid.valor, 0),
        'currency', coalesce(last_paid.moeda, 'BRL'),
        'lastAccessAt', stats.ultimo_acesso,
        'usersCount', stats.usuarios,
        'customersCount', stats.clientes,
        'ordersCount', stats.ordens,
        'storageBytes', stats.storage_bytes,
        'status', effective.status,
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
  cross join lateral (
    select private.effective_company_status(e.id) as status
  ) effective
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
             when coalesce(obj.metadata->>'size', '') ~ '^[0-9]+$'
               then (obj.metadata->>'size')::bigint
             else 0
           end
         ),
         0
       )
       from storage.objects obj
       where obj.bucket_id = 'os-fotos'
         and obj.name like e.id::text || '/%') as storage_bytes
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
    'status', effective.status,
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
      'status', case
        when effective.status in ('PAST_DUE', 'SUSPENDED', 'CANCELED')
          then effective.status
        else a.status
      end,
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
  cross join lateral (
    select private.effective_company_status(e.id) as status
  ) effective
  where e.id = p_empresa
    and c.id;

  return result;
end
$function$;
