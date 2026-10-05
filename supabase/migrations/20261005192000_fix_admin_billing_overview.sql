begin;

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
    'estimatedMrr',
      (
        select count(*)
        from subscriptions
        where effective_status in ('ACTIVE', 'PAST_DUE')
          and has_paid
      ) * cfg.monthly_payment_amount,
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

commit;
