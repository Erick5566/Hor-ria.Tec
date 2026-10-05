-- Keep access/billing status and Super Admin company rows reproducible in source control.

create or replace function private.effective_company_status(p_empresa uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.status in ('SUSPENDED', 'CANCELED', 'PENDING_DELETION') then e.status
    when a.id is null then e.status
    when a.status = 'CANCELED' then 'CANCELED'
    when a.status = 'SUSPENDED' then 'SUSPENDED'
    when a.status = 'TRIAL' then
      case
        when a.trial_ends_at is null then 'SUSPENDED'
        when now() <= a.trial_ends_at then 'TRIAL'
        when now() <= a.trial_ends_at + make_interval(hours => c.billing_grace_hours) then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'ACTIVE' then
      case
        when a.next_billing_date is null or now() <= a.next_billing_date then 'ACTIVE'
        when now() <= a.next_billing_date + make_interval(hours => c.billing_grace_hours) then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'PAST_DUE' then
      case
        when now() <= coalesce(a.next_billing_date,a.trial_ends_at,a.atualizado_em)
             + make_interval(hours => c.billing_grace_hours) then 'PAST_DUE'
        else 'SUSPENDED'
      end
    else e.status
  end
  from public.empresas e
  left join public.assinaturas a on a.empresa_id=e.id
  cross join public.configuracoes_plataforma c
  where e.id=p_empresa and c.id
$$;

create or replace function public.access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    join public.empresas e on e.id=m.empresa_id
    where m.usuario_id=auth.uid()
      and m.status='ACTIVE'
    order by case m.role when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end
    limit 1
  ),
  config as (
    select * from public.configuracoes_plataforma where id
  )
  select jsonb_build_object(
    'authenticated',auth.uid() is not null,
    'userId',auth.uid(),
    'platformRole',coalesce(p.platform_role,'USER'),
    'isSuperAdmin',coalesce(p.platform_role='SUPER_ADMIN',false),
    'globalMaintenance',config.manutencao_global,
    'maintenanceMessage',config.mensagem_manutencao,
    'registrationEnabled',config.registration_enabled,
    'maxCompanies',config.max_companies,
    'publicAppUrl',config.public_app_url,
    'billing',jsonb_build_object(
      'graceHours',config.billing_grace_hours,
      'initialAmount',config.initial_payment_amount,
      'monthlyAmount',config.monthly_payment_amount,
      'hasApprovedPayment',case
        when a.id is null then false
        else exists(
          select 1 from public.pagamentos pg
          where pg.assinatura_id=a.id and pg.status='APPROVED'
        )
      end
    ),
    'company',case
      when member.empresa_id is null then null
      else jsonb_build_object(
        'id',member.empresa_id,
        'name',member.nome,
        'slug',member.slug,
        'role',member.role,
        'status',member.empresa_status,
        'maintenance',member.manutencao_ativa,
        'maintenanceMessage',member.mensagem_manutencao,
        'scheduledDeletionAt',member.scheduled_deletion_at,
        'featureFlags',config.feature_flags || member.feature_flags
      )
    end,
    'subscription',case
      when a.id is null then null
      else jsonb_build_object(
        'id',a.id,
        'status',case
          when member.empresa_status in ('PAST_DUE','SUSPENDED','CANCELED') then member.empresa_status
          else a.status
        end,
        'startedAt',a.started_at,
        'trialEndsAt',a.trial_ends_at,
        'nextBillingDate',a.next_billing_date,
        'cancelledAt',a.cancelled_at
      )
    end
  )
  from config
  left join public.perfis p on p.usuario_id=auth.uid()
  left join member on true
  left join public.assinaturas a on a.empresa_id=member.empresa_id
$$;

create or replace function public.admin_list_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_super_admin();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'name',e.nome,
        'slug',e.slug,
        'responsible',coalesce(p.nome,''),
        'email',coalesce(p.email,''),
        'phone',e.telefone,
        'createdAt',e.criado_em,
        'plan',pl.nome,
        'subscriptionStatus',case
          when effective.status in ('PAST_DUE','SUSPENDED','CANCELED') then effective.status
          else a.status
        end,
        'trialEndsAt',a.trial_ends_at,
        'nextBillingDate',a.next_billing_date,
        'dueAt',billing.due_at,
        'graceEndsAt',case
          when billing.due_at is null then null
          else billing.due_at + make_interval(hours => cfg.billing_grace_hours)
        end,
        'amountDue',case
          when billing.due_at is not null
           and billing.due_at < now()
           and effective.status in ('PAST_DUE','SUSPENDED')
           and e.status not in ('SUSPENDED','CANCELED','PENDING_DELETION')
            then case when billing.has_paid then cfg.monthly_payment_amount else cfg.initial_payment_amount end
          else 0
        end,
        'monthlyValue',cfg.monthly_payment_amount,
        'currency','BRL',
        'lastPaymentAt',billing.last_payment_at,
        'lastPaymentAmount',billing.last_payment_amount,
        'lastAccessAt',stats.ultimo_acesso,
        'usersCount',stats.usuarios,
        'customersCount',stats.clientes,
        'ordersCount',stats.ordens,
        'storageBytes',stats.storage_bytes,
        'status',effective.status,
        'maintenance',e.manutencao_ativa,
        'scheduledDeletionAt',e.scheduled_deletion_at
      )
      order by e.criado_em desc
    ),
    '[]'::jsonb
  )
  into result
  from public.empresas e
  join public.perfis p on p.usuario_id=e.dono_id
  left join public.assinaturas a on a.empresa_id=e.id
  left join public.planos pl on pl.id=a.plano_id
  cross join public.configuracoes_plataforma cfg
  cross join lateral (select private.effective_company_status(e.id) as status) effective
  cross join lateral (
    select
      case
        when a.id is null then null
        when a.status='TRIAL' then a.trial_ends_at
        else coalesce(a.next_billing_date,a.trial_ends_at)
      end as due_at,
      exists(
        select 1 from public.pagamentos pg
        where pg.assinatura_id=a.id and pg.status='APPROVED'
      ) as has_paid,
      (
        select coalesce(pg.paid_at,pg.criado_em)
        from public.pagamentos pg
        where pg.assinatura_id=a.id and pg.status='APPROVED'
        order by coalesce(pg.paid_at,pg.criado_em) desc
        limit 1
      ) as last_payment_at,
      (
        select pg.valor
        from public.pagamentos pg
        where pg.assinatura_id=a.id and pg.status='APPROVED'
        order by coalesce(pg.paid_at,pg.criado_em) desc
        limit 1
      ) as last_payment_amount
  ) billing
  cross join lateral (
    select
      (select max(m.ultimo_acesso_em) from public.empresa_membros m where m.empresa_id=e.id) as ultimo_acesso,
      (select count(*) from public.empresa_membros m where m.empresa_id=e.id and m.status='ACTIVE') as usuarios,
      (select count(*) from public.clientes c where c.empresa_id=e.id) as clientes,
      (select count(*) from public.ordens_servico o where o.empresa_id=e.id) as ordens,
      (
        select coalesce(sum(
          case when coalesce(obj.metadata->>'size','') ~ '^[0-9]+$'
               then (obj.metadata->>'size')::bigint else 0 end
        ),0)
        from storage.objects obj
        where obj.bucket_id='os-fotos' and obj.name like e.id::text || '/%'
      ) as storage_bytes
  ) stats
  where cfg.id;

  return result;
end
$$;

revoke all on function public.access_context() from public,anon;
grant execute on function public.access_context() to authenticated;
revoke all on function public.admin_list_companies() from public,anon;
grant execute on function public.admin_list_companies() to authenticated;
