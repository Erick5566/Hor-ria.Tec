-- Live billing, 24-hour grace period, Super Admin finance and broader Realtime coverage.

alter table public.configuracoes_plataforma
  add column if not exists billing_grace_hours integer not null default 24
    check (billing_grace_hours between 1 and 168),
  add column if not exists initial_payment_amount numeric(12,2) not null default 44.99
    check (initial_payment_amount >= 0),
  add column if not exists monthly_payment_amount numeric(12,2) not null default 59.00
    check (monthly_payment_amount >= 0);

update public.configuracoes_plataforma
set billing_grace_hours = 24
where id;

create table if not exists private.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (char_length(trim(description)) between 1 and 200),
  category text not null default 'outros' check (char_length(trim(category)) between 1 and 80),
  amount numeric(12,2) not null check (amount > 0),
  incurred_on date not null default current_date,
  recurring boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.platform_expenses enable row level security;
revoke all on private.platform_expenses from public, anon, authenticated;

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
as $$
declare created private.platform_expenses;
begin
  perform private.require_super_admin();
  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'Descrição da despesa não informada';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor da despesa inválido';
  end if;

  insert into private.platform_expenses(description,category,amount,incurred_on,recurring,notes,created_by)
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

  insert into public.admin_audit_logs(actor_user_id,action,motivo,detalhes)
  values(
    auth.uid(),'PLATFORM_EXPENSE_CREATED',created.description,
    jsonb_build_object('expenseId',created.id,'amount',created.amount,'category',created.category,'incurredOn',created.incurred_on)
  );

  return jsonb_build_object(
    'id',created.id,'description',created.description,'category',created.category,
    'amount',created.amount,'incurredOn',created.incurred_on,'recurring',created.recurring,
    'notes',created.notes,'createdAt',created.created_at
  );
end $$;

create or replace function public.admin_list_platform_expenses(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_super_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'description',x.description,'category',x.category,'amount',x.amount,
    'incurredOn',x.incurred_on,'recurring',x.recurring,'notes',x.notes,'createdAt',x.created_at
  ) order by x.incurred_on desc,x.created_at desc),'[]'::jsonb)
  into result
  from (
    select * from private.platform_expenses
    order by incurred_on desc,created_at desc
    limit least(greatest(coalesce(p_limit,50),1),200)
  ) x;
  return result;
end $$;

create or replace function public.admin_delete_platform_expense(p_expense uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare deleted private.platform_expenses;
begin
  perform private.require_super_admin();
  delete from private.platform_expenses where id=p_expense returning * into deleted;
  if deleted.id is null then return false; end if;
  insert into public.admin_audit_logs(actor_user_id,action,motivo,detalhes)
  values(
    auth.uid(),'PLATFORM_EXPENSE_DELETED',deleted.description,
    jsonb_build_object('expenseId',deleted.id,'amount',deleted.amount,'category',deleted.category,'incurredOn',deleted.incurred_on)
  );
  return true;
end $$;

create or replace function public.admin_billing_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_super_admin();

  with cfg as (
    select * from public.configuracoes_plataforma where id
  ),
  subscriptions as (
    select
      e.id as empresa_id,
      a.id as assinatura_id,
      private.effective_company_status(e.id) as effective_status,
      case when a.status='TRIAL' then a.trial_ends_at else coalesce(a.next_billing_date,a.trial_ends_at) end as due_at,
      exists(select 1 from public.pagamentos p where p.assinatura_id=a.id and p.status='APPROVED') as has_paid,
      e.status as company_stored_status
    from public.empresas e
    join public.assinaturas a on a.empresa_id=e.id
  ),
  receivables as (
    select s.*,
      case when s.has_paid then cfg.monthly_payment_amount else cfg.initial_payment_amount end as amount_due
    from subscriptions s cross join cfg
    where s.due_at is not null and s.due_at < now()
      and s.effective_status in ('PAST_DUE','SUSPENDED')
      and s.company_stored_status not in ('SUSPENDED','CANCELED','PENDING_DELETION')
  ),
  revenue as (
    select
      coalesce(sum(p.valor) filter(where p.status='APPROVED' and coalesce(p.paid_at,p.criado_em)>=date_trunc('month',now())),0)::numeric(12,2) month_total,
      coalesce(sum(p.valor) filter(where p.status='APPROVED'),0)::numeric(12,2) all_total
    from public.pagamentos p
  ),
  expense as (
    select
      coalesce(sum(x.amount) filter(where x.incurred_on>=date_trunc('month',current_date)::date),0)::numeric(12,2) month_total,
      coalesce(sum(x.amount),0)::numeric(12,2) all_total
    from private.platform_expenses x
  )
  select jsonb_build_object(
    'receivedThisMonth',revenue.month_total,
    'receivedTotal',revenue.all_total,
    'expensesThisMonth',expense.month_total,
    'expensesTotal',expense.all_total,
    'netThisMonth',(revenue.month_total-expense.month_total)::numeric(12,2),
    'receivableTotal',coalesce((select sum(amount_due) from receivables),0)::numeric(12,2),
    'pendingCount',(select count(*) from subscriptions where effective_status='PAST_DUE'),
    'overdueCount',(select count(*) from receivables),
    'dueNext24hCount',(select count(*) from subscriptions where effective_status in ('ACTIVE','TRIAL') and due_at>=now() and due_at<=now()+interval '24 hours'),
    'activeSubscriptions',(select count(*) from subscriptions where effective_status='ACTIVE'),
    'trialSubscriptions',(select count(*) from subscriptions where effective_status='TRIAL'),
    'suspendedCount',(select count(*) from subscriptions where effective_status='SUSPENDED'),
    'estimatedMrr',((select count(*) from subscriptions where effective_status in ('ACTIVE','PAST_DUE') and has_paid)*cfg.monthly_payment_amount),
    'graceHours',cfg.billing_grace_hours,
    'initialAmount',cfg.initial_payment_amount,
    'monthlyAmount',cfg.monthly_payment_amount
  )
  into result
  from revenue cross join expense cross join cfg;

  return result;
end $$;

revoke all on function public.admin_add_platform_expense(text,numeric,text,date,boolean,text) from public,anon;
grant execute on function public.admin_add_platform_expense(text,numeric,text,date,boolean,text) to authenticated;
revoke all on function public.admin_list_platform_expenses(integer) from public,anon;
grant execute on function public.admin_list_platform_expenses(integer) to authenticated;
revoke all on function public.admin_delete_platform_expense(uuid) from public,anon;
grant execute on function public.admin_delete_platform_expense(uuid) to authenticated;
revoke all on function public.admin_billing_overview() from public,anon;
grant execute on function public.admin_billing_overview() to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pagamentos','diagnosticos','fiscal_documents','fiscal_settings','fotos_os',
    'garantias','mesas_reparo','movimentos_estoque','notificacoes','pagina_publica_config',
    'pecas_aplicadas','pos_venda','seminovos','venda_itens','venda_pagamentos'
  ]
  loop
    if exists(select 1 from pg_publication where pubname='supabase_realtime')
       and exists(select 1 from information_schema.tables where table_schema='public' and table_name=tbl)
       and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl)
    then
      execute format('alter publication supabase_realtime add table public.%I',tbl);
    end if;
  end loop;
end $$;
