begin;

alter table public.configuracoes_plataforma
  add column if not exists billing_grace_hours integer not null default 24,
  add column if not exists initial_payment_amount numeric(12,2) not null default 44.99,
  add column if not exists monthly_payment_amount numeric(12,2) not null default 59.00;

alter table public.configuracoes_plataforma
  drop constraint if exists configuracoes_plataforma_billing_grace_hours_check,
  drop constraint if exists configuracoes_plataforma_initial_payment_amount_check,
  drop constraint if exists configuracoes_plataforma_monthly_payment_amount_check;

alter table public.configuracoes_plataforma
  add constraint configuracoes_plataforma_billing_grace_hours_check
    check (billing_grace_hours between 1 and 168),
  add constraint configuracoes_plataforma_initial_payment_amount_check
    check (initial_payment_amount > 0),
  add constraint configuracoes_plataforma_monthly_payment_amount_check
    check (monthly_payment_amount > 0);

update public.configuracoes_plataforma
set billing_grace_hours = 24,
    billing_grace_days = 1,
    initial_payment_amount = 44.99,
    monthly_payment_amount = 59.00
where id;

create table if not exists private.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (char_length(trim(description)) between 1 and 200),
  category text not null default 'outros' check (char_length(trim(category)) between 1 and 80),
  amount numeric(12,2) not null check (amount > 0),
  incurred_on date not null default current_date,
  recurring boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.platform_expenses from public, anon, authenticated;

do $
declare
  target_table text;
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach target_table in array array['empresas','assinaturas','vendas','empresa_membros']
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end
$;

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
      then e.status
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
        when now() <= a.trial_ends_at + make_interval(hours => c.billing_grace_hours)
          then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'ACTIVE' then
      case
        when a.next_billing_date is null or now() <= a.next_billing_date
          then 'ACTIVE'
        when now() <= a.next_billing_date + make_interval(hours => c.billing_grace_hours)
          then 'PAST_DUE'
        else 'SUSPENDED'
      end
    when a.status = 'PAST_DUE' then
      case
        when now() <= coalesce(
          a.next_billing_date,
          a.trial_ends_at,
          a.atualizado_em
        ) + make_interval(hours => c.billing_grace_hours)
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
      'monthlyAmount', config.monthly_payment_amount
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

create or replace function public.admin_confirm_manual_payment(
  p_empresa uuid,
  p_confirmation_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  subscription public.assinaturas;
  existing_payment public.pagamentos;
  payment_id uuid;
  payment_amount numeric(12,2);
  payment_kind text;
  next_billing timestamptz;
  external_id text;
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
  initial_amount numeric(12,2);
  monthly_amount numeric(12,2);
begin
  perform private.require_super_admin();

  select c.initial_payment_amount, c.monthly_payment_amount
  into initial_amount, monthly_amount
  from public.configuracoes_plataforma c
  where c.id;

  if p_confirmation_id is null then
    raise exception 'Identificador da confirmação não informado';
  end if;

  if length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'A observação deve ter no máximo 1000 caracteres';
  end if;

  external_id := 'manual_pix:' || p_confirmation_id::text;

  select *
    into strict subscription
  from public.assinaturas
  where empresa_id = p_empresa
  for update;

  select *
    into existing_payment
  from public.pagamentos
  where provider = 'manual_pix'
    and external_payment_id = external_id
  limit 1;

  if found then
    return jsonb_build_object(
      'paymentId', existing_payment.id,
      'amount', existing_payment.valor,
      'kind', coalesce(existing_payment.payload->>'kind', 'manual'),
      'nextBillingDate', subscription.next_billing_date,
      'duplicate', true
    );
  end if;

  if exists (
    select 1
    from public.pagamentos p
    where p.assinatura_id = subscription.id
      and p.status = 'APPROVED'
  ) then
    payment_kind := 'monthly';
    payment_amount := monthly_amount;
    next_billing := case
      when subscription.next_billing_date is not null
       and subscription.next_billing_date > now()
        then subscription.next_billing_date + interval '1 month'
      else now() + interval '1 month'
    end;
  else
    payment_kind := 'initial';
    payment_amount := initial_amount;
    next_billing := now() + interval '7 days';
  end if;

  insert into public.pagamentos(
    empresa_id,
    assinatura_id,
    provider,
    external_payment_id,
    valor,
    moeda,
    status,
    paid_at,
    payload
  )
  values(
    p_empresa,
    subscription.id,
    'manual_pix',
    external_id,
    payment_amount,
    'BRL',
    'APPROVED',
    now(),
    jsonb_build_object(
      'manual', true,
      'kind', payment_kind,
      'confirmedBy', auth.uid()
    )
  )
  returning id into payment_id;

  update public.assinaturas
  set status = 'ACTIVE',
      next_billing_date = next_billing,
      cancelled_at = null,
      atualizado_em = now()
  where id = subscription.id;

  update public.empresas
  set status = 'ACTIVE',
      scheduled_deletion_at = null,
      atualizado_em = now()
  where id = p_empresa;

  insert into public.admin_audit_logs(
    actor_user_id,
    action,
    empresa_id,
    motivo,
    detalhes
  )
  values(
    auth.uid(),
    'MANUAL_PAYMENT_APPROVED',
    p_empresa,
    coalesce(normalized_note, 'PIX confirmado manualmente'),
    jsonb_build_object(
      'paymentId', payment_id,
      'amount', payment_amount,
      'currency', 'BRL',
      'kind', payment_kind,
      'nextBillingDate', next_billing,
      'confirmationId', p_confirmation_id
    )
  );

  return jsonb_build_object(
    'paymentId', payment_id,
    'amount', payment_amount,
    'kind', payment_kind,
    'nextBillingDate', next_billing,
    'duplicate', false
  );
exception
  when no_data_found then
    raise exception 'Assinatura não encontrada';
end
$function$;

revoke all on function public.admin_confirm_manual_payment(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_confirm_manual_payment(uuid, uuid, text)
to authenticated;

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
        'dueAt', billing.due_at,
        'graceEndsAt', case
          when billing.due_at is null then null
          else billing.due_at + make_interval(hours => cfg.billing_grace_hours)
        end,
        'amountDue', case
          when billing.due_at is not null
           and billing.due_at < now()
           and effective.status in ('PAST_DUE', 'SUSPENDED')
           and e.status not in ('SUSPENDED', 'CANCELED', 'PENDING_DELETION')
            then case when billing.has_paid then cfg.monthly_payment_amount
                      else cfg.initial_payment_amount end
          else 0
        end,
        'monthlyValue', cfg.monthly_payment_amount,
        'currency', 'BRL',
        'lastPaymentAt', billing.last_payment_at,
        'lastPaymentAmount', billing.last_payment_amount,
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
  cross join public.configuracoes_plataforma cfg
  cross join lateral (
    select private.effective_company_status(e.id) as status
  ) effective
  cross join lateral (
    select
      case
        when a.id is null then null
        when a.status = 'TRIAL' then a.trial_ends_at
        else coalesce(a.next_billing_date, a.trial_ends_at)
      end as due_at,
      exists (
        select 1 from public.pagamentos pg
        where pg.assinatura_id = a.id
          and pg.status = 'APPROVED'
      ) as has_paid,
      (
        select coalesce(pg.paid_at, pg.criado_em)
        from public.pagamentos pg
        where pg.assinatura_id = a.id
          and pg.status = 'APPROVED'
        order by coalesce(pg.paid_at, pg.criado_em) desc
        limit 1
      ) as last_payment_at,
      (
        select pg.valor
        from public.pagamentos pg
        where pg.assinatura_id = a.id
          and pg.status = 'APPROVED'
        order by coalesce(pg.paid_at, pg.criado_em) desc
        limit 1
      ) as last_payment_amount
  ) billing
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
  ) stats
  where cfg.id;

  return result;
end
$function$;

revoke all on function public.admin_list_companies() from public, anon, authenticated;
grant execute on function public.admin_list_companies() to authenticated;

create or replace function public.admin_billing_overview()
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

  with cfg as (
    select *
    from public.configuracoes_plataforma
    where id
  ),
  subscriptions as (
    select
      e.id as empresa_id,
      a.id as assinatura_id,
      a.status as stored_status,
      private.effective_company_status(e.id) as effective_status,
      case
        when a.status = 'TRIAL' then a.trial_ends_at
        else coalesce(a.next_billing_date, a.trial_ends_at)
      end as due_at,
      exists (
        select 1
        from public.pagamentos p
        where p.assinatura_id = a.id
          and p.status = 'APPROVED'
      ) as has_paid,
      e.status as company_stored_status
    from public.empresas e
    join public.assinaturas a on a.empresa_id = e.id
  ),
  receivables as (
    select
      s.*,
      case
        when s.has_paid then cfg.monthly_payment_amount
        else cfg.initial_payment_amount
      end as amount_due
    from subscriptions s
    cross join cfg
    where s.due_at is not null
      and s.due_at < now()
      and s.effective_status in ('PAST_DUE', 'SUSPENDED')
      and s.company_stored_status not in ('SUSPENDED', 'CANCELED', 'PENDING_DELETION')
  ),
  revenue as (
    select
      coalesce(sum(p.valor) filter (
        where p.status = 'APPROVED'
          and coalesce(p.paid_at, p.criado_em) >= date_trunc('month', now())
      ), 0)::numeric(12,2) as month_total,
      coalesce(sum(p.valor) filter (where p.status = 'APPROVED'), 0)::numeric(12,2) as all_total
    from public.pagamentos p
  ),
  expense as (
    select
      coalesce(sum(x.amount) filter (
        where x.incurred_on >= date_trunc('month', current_date)::date
      ), 0)::numeric(12,2) as month_total,
      coalesce(sum(x.amount), 0)::numeric(12,2) as all_total
    from private.platform_expenses x
  )
  select jsonb_build_object(
    'receivedThisMonth', revenue.month_total,
    'receivedTotal', revenue.all_total,
    'expensesThisMonth', expense.month_total,
    'expensesTotal', expense.all_total,
    'netThisMonth', (revenue.month_total - expense.month_total)::numeric(12,2),
    'receivableTotal', coalesce((select sum(amount_due) from receivables), 0)::numeric(12,2),
    'pendingCount', (select count(*) from subscriptions where effective_status = 'PAST_DUE'),
    'overdueCount', (select count(*) from receivables),
    'dueNext24hCount', (
      select count(*)
      from subscriptions
      where effective_status in ('ACTIVE', 'TRIAL')
        and due_at >= now()
        and due_at <= now() + interval '24 hours'
    ),
    'activeSubscriptions', (
      select count(*) from subscriptions where effective_status = 'ACTIVE'
    ),
    'trialSubscriptions', (
      select count(*) from subscriptions where effective_status = 'TRIAL'
    ),
    'suspendedCount', (
      select count(*) from subscriptions where effective_status = 'SUSPENDED'
    ),
    'estimatedMrr', (
      select coalesce(count(*) filter (
        where effective_status in ('ACTIVE', 'PAST_DUE')
          and has_paid
      ), 0) * cfg.monthly_payment_amount
      from subscriptions
      cross join cfg
    ),
    'graceHours', cfg.billing_grace_hours,
    'initialAmount', cfg.initial_payment_amount,
    'monthlyAmount', cfg.monthly_payment_amount
  )
  into result
  from revenue
  cross join expense
  cross join cfg;

  return result;
end
$function$;

create or replace function public.admin_list_platform_expenses(p_limit integer default 50)
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
        'id', x.id,
        'description', x.description,
        'category', x.category,
        'amount', x.amount,
        'incurredOn', x.incurred_on,
        'recurring', x.recurring,
        'notes', x.notes,
        'createdAt', x.created_at
      )
      order by x.incurred_on desc, x.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select *
    from private.platform_expenses
    order by incurred_on desc, created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) x;

  return result;
end
$function$;

create or replace function public.admin_add_platform_expense(
  p_description text,
  p_amount numeric,
  p_category text default 'outros',
  p_incurred_on date default current_date,
  p_recurring boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  created private.platform_expenses;
begin
  perform private.require_super_admin();

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'Descrição da despesa não informada';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da despesa inválido';
  end if;

  insert into private.platform_expenses(
    description,
    category,
    amount,
    incurred_on,
    recurring,
    notes,
    created_by
  )
  values(
    trim(p_description),
    coalesce(nullif(trim(p_category), ''), 'outros'),
    round(p_amount, 2),
    coalesce(p_incurred_on, current_date),
    coalesce(p_recurring, false),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning * into created;

  insert into public.admin_audit_logs(
    actor_user_id, action, motivo, detalhes
  )
  values(
    auth.uid(),
    'PLATFORM_EXPENSE_CREATED',
    created.description,
    jsonb_build_object(
      'expenseId', created.id,
      'amount', created.amount,
      'category', created.category,
      'incurredOn', created.incurred_on
    )
  );

  return jsonb_build_object(
    'id', created.id,
    'description', created.description,
    'category', created.category,
    'amount', created.amount,
    'incurredOn', created.incurred_on,
    'recurring', created.recurring,
    'notes', created.notes,
    'createdAt', created.created_at
  );
end
$function$;

create or replace function public.admin_delete_platform_expense(p_expense uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  deleted private.platform_expenses;
begin
  perform private.require_super_admin();

  delete from private.platform_expenses
  where id = p_expense
  returning * into deleted;

  if deleted.id is null then
    return false;
  end if;

  insert into public.admin_audit_logs(
    actor_user_id, action, motivo, detalhes
  )
  values(
    auth.uid(),
    'PLATFORM_EXPENSE_DELETED',
    deleted.description,
    jsonb_build_object(
      'expenseId', deleted.id,
      'amount', deleted.amount,
      'category', deleted.category,
      'incurredOn', deleted.incurred_on
    )
  );

  return true;
end
$function$;

revoke all on function public.admin_billing_overview() from public, anon, authenticated;
revoke all on function public.admin_list_platform_expenses(integer) from public, anon, authenticated;
revoke all on function public.admin_add_platform_expense(text,numeric,text,date,boolean,text) from public, anon, authenticated;
revoke all on function public.admin_delete_platform_expense(uuid) from public, anon, authenticated;

grant execute on function public.admin_billing_overview() to authenticated;
grant execute on function public.admin_list_platform_expenses(integer) to authenticated;
grant execute on function public.admin_add_platform_expense(text,numeric,text,date,boolean,text) to authenticated;
grant execute on function public.admin_delete_platform_expense(uuid) to authenticated;

commit;
