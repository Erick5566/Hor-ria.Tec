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
