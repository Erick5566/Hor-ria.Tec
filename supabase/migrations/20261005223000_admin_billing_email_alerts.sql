do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and not exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'create extension pg_cron with schema pg_catalog';
  end if;
end $$;

alter table public.configuracoes_plataforma
  add column if not exists admin_notification_email text not null default 'horariaagenda@gmail.com',
  add column if not exists admin_email_dispatch_url text;

update public.configuracoes_plataforma
set admin_notification_email = 'horariaagenda@gmail.com',
    admin_email_dispatch_url = 'https://ijixyflyhiindirtqvxp.supabase.co/functions/v1/admin-billing-email'
where id;

create table if not exists public.admin_email_notifications (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('billing_grace_started','payment_approved')),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  assinatura_id uuid references public.assinaturas(id) on delete cascade,
  pagamento_id uuid references public.pagamentos(id) on delete cascade,
  recipient text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  unique_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed')),
  dispatch_token uuid not null default gen_random_uuid(),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_email_notifications enable row level security;
revoke all on public.admin_email_notifications from anon, authenticated;

create index if not exists admin_email_notifications_status_retry_idx
  on public.admin_email_notifications(status, last_attempt_at, created_at);

create or replace function private.dispatch_admin_email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  dispatch_url text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select nullif(trim(c.admin_email_dispatch_url), '')
    into dispatch_url
  from public.configuracoes_plataforma c
  where c.id;

  if dispatch_url is null then
    return new;
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return new;
  end if;

  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object('id', new.id, 'dispatchToken', new.dispatch_token),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'Falha ao enfileirar e-mail administrativo %: %', new.id, sqlerrm;
    return new;
end
$function$;

revoke all on function private.dispatch_admin_email_notification() from public, anon, authenticated;

drop trigger if exists dispatch_admin_email_notification on public.admin_email_notifications;
create trigger dispatch_admin_email_notification
after insert on public.admin_email_notifications
for each row
execute function private.dispatch_admin_email_notification();

create or replace function private.enqueue_admin_payment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  company_name text;
  recipient_email text;
  next_billing timestamptz;
  payment_kind text;
begin
  if new.status <> 'APPROVED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'APPROVED' then
    return new;
  end if;

  select e.nome, a.next_billing_date, c.admin_notification_email
    into company_name, next_billing, recipient_email
  from public.empresas e
  join public.assinaturas a on a.id = new.assinatura_id and a.empresa_id = e.id
  cross join public.configuracoes_plataforma c
  where e.id = new.empresa_id and c.id;

  payment_kind := coalesce(nullif(new.payload->>'kind', ''), 'payment');

  insert into public.admin_email_notifications(
    event_type, empresa_id, assinatura_id, pagamento_id,
    recipient, subject, payload, unique_key
  )
  values(
    'payment_approved',
    new.empresa_id,
    new.assinatura_id,
    new.id,
    recipient_email,
    'Pagamento confirmado — ' || company_name,
    jsonb_build_object(
      'companyName', company_name,
      'amount', new.valor,
      'currency', new.moeda,
      'paidAt', coalesce(new.paid_at, new.criado_em),
      'provider', new.provider,
      'paymentKind', payment_kind,
      'externalPaymentId', new.external_payment_id,
      'nextBillingDate', next_billing,
      'adminUrl', 'https://horaria.site/admin'
    ),
    'billing:payment:' || new.id::text || ':approved'
  )
  on conflict(unique_key) do nothing;

  return new;
end
$function$;

revoke all on function private.enqueue_admin_payment_email() from public, anon, authenticated;

drop trigger if exists enqueue_admin_payment_email on public.pagamentos;
create trigger enqueue_admin_payment_email
after insert or update of status on public.pagamentos
for each row
execute function private.enqueue_admin_payment_email();

create or replace function private.enqueue_admin_billing_due_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  inserted_count integer := 0;
begin
  with cfg as (
    select
      c.admin_notification_email,
      c.billing_grace_hours,
      c.initial_payment_amount,
      c.monthly_payment_amount
    from public.configuracoes_plataforma c
    where c.id
  ),
  due_accounts as (
    select
      e.id as empresa_id,
      e.nome as company_name,
      a.id as assinatura_id,
      case
        when a.status = 'TRIAL' then a.trial_ends_at
        else coalesce(a.next_billing_date, a.trial_ends_at)
      end as due_at,
      private.effective_company_status(e.id) as effective_status,
      exists (
        select 1
        from public.pagamentos p
        where p.assinatura_id = a.id
          and p.status = 'APPROVED'
      ) as has_approved_payment
    from public.empresas e
    join public.assinaturas a on a.empresa_id = e.id
    where e.status not in ('CANCELED','PENDING_DELETION')
  )
  insert into public.admin_email_notifications(
    event_type, empresa_id, assinatura_id, recipient,
    subject, payload, unique_key
  )
  select
    'billing_grace_started',
    d.empresa_id,
    d.assinatura_id,
    cfg.admin_notification_email,
    'Assinatura entrou nas 24h de tolerância — ' || d.company_name,
    jsonb_build_object(
      'companyName', d.company_name,
      'dueAt', d.due_at,
      'graceEndsAt', d.due_at + make_interval(hours => cfg.billing_grace_hours),
      'graceHours', cfg.billing_grace_hours,
      'amountDue', case
        when d.has_approved_payment then cfg.monthly_payment_amount
        else cfg.initial_payment_amount
      end,
      'currency', 'BRL',
      'status', d.effective_status,
      'adminUrl', 'https://horaria.site/admin'
    ),
    'billing:grace:' || d.assinatura_id::text || ':' ||
      floor(extract(epoch from d.due_at))::bigint::text
  from due_accounts d
  cross join cfg
  where d.due_at is not null
    and d.due_at < now()
    and d.effective_status = 'PAST_DUE'
    and now() <= d.due_at + make_interval(hours => cfg.billing_grace_hours)
  on conflict(unique_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end
$function$;

revoke all on function private.enqueue_admin_billing_due_notifications() from public, anon, authenticated;

create or replace function private.retry_admin_email_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  dispatch_url text;
  item record;
  queued integer := 0;
begin
  select nullif(trim(c.admin_email_dispatch_url), '')
    into dispatch_url
  from public.configuracoes_plataforma c
  where c.id;

  if dispatch_url is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return 0;
  end if;

  for item in
    select n.id, n.dispatch_token
    from public.admin_email_notifications n
    where n.status in ('pending','failed')
      and (n.last_attempt_at is null or n.last_attempt_at <= now() - interval '10 minutes')
    order by n.created_at
    limit 20
  loop
    perform net.http_post(
      url := dispatch_url,
      body := jsonb_build_object('id', item.id, 'dispatchToken', item.dispatch_token),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
    queued := queued + 1;
  end loop;

  return queued;
exception
  when others then
    raise warning 'Falha ao reenfileirar e-mails administrativos: %', sqlerrm;
    return queued;
end
$function$;

revoke all on function private.retry_admin_email_notifications() from public, anon, authenticated;

do $$
declare
  old_job bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    for old_job in
      select jobid from cron.job where jobname = 'horaria-admin-billing-email-alerts'
    loop
      perform cron.unschedule(old_job);
    end loop;

    perform cron.schedule(
      'horaria-admin-billing-email-alerts',
      '*/10 * * * *',
      'select private.enqueue_admin_billing_due_notifications(); select private.retry_admin_email_notifications();'
    );
  end if;
end $$;
