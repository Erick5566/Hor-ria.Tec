begin;

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
    'billing', jsonb_build_object(
      'graceHours', config.billing_grace_hours,
      'initialAmount', config.initial_payment_amount,
      'monthlyAmount', config.monthly_payment_amount,
      'hasApprovedPayment', case
        when a.id is null then false
        else exists (
          select 1
          from public.pagamentos pg
          where pg.assinatura_id = a.id
            and pg.status = 'APPROVED'
        )
      end
    ),
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

commit;
