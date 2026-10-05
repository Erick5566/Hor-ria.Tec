create or replace function private.enqueue_admin_payment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  company_name text;
  company_slug text;
  company_whatsapp text;
  company_city text;
  company_state text;
  owner_name text;
  owner_email text;
  owner_phone text;
  plan_name text;
  subscription_status text;
  recipient_email text;
  current_next_billing timestamptz;
  displayed_next_billing timestamptz;
  payment_kind text;
begin
  if new.status <> 'APPROVED' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'APPROVED' then
    return new;
  end if;

  select
    e.nome,
    e.slug,
    coalesce(nullif(e.whatsapp, ''), nullif(e.telefone, '')),
    e.cidade,
    e.estado,
    pf.nome,
    pf.email,
    pf.telefone,
    pl.nome,
    a.status,
    a.next_billing_date,
    c.admin_notification_email
  into
    company_name,
    company_slug,
    company_whatsapp,
    company_city,
    company_state,
    owner_name,
    owner_email,
    owner_phone,
    plan_name,
    subscription_status,
    current_next_billing,
    recipient_email
  from public.empresas e
  join public.assinaturas a
    on a.id = new.assinatura_id
   and a.empresa_id = e.id
  left join public.perfis pf on pf.usuario_id = e.dono_id
  left join public.planos pl on pl.id = a.plano_id
  cross join public.configuracoes_plataforma c
  where e.id = new.empresa_id
    and c.id;

  payment_kind := coalesce(nullif(new.payload->>'kind', ''), 'payment');

  displayed_next_billing := current_next_billing;
  if new.provider = 'manual_pix' then
    displayed_next_billing := case
      when payment_kind = 'initial'
        then now() + interval '7 days'
      when current_next_billing is not null
       and current_next_billing > now()
        then current_next_billing + interval '1 month'
      else now() + interval '1 month'
    end;
  end if;

  insert into public.admin_email_notifications(
    event_type,
    empresa_id,
    assinatura_id,
    pagamento_id,
    recipient,
    subject,
    payload,
    unique_key
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
      'companySlug', company_slug,
      'ownerName', owner_name,
      'ownerEmail', owner_email,
      'ownerPhone', owner_phone,
      'companyWhatsapp', company_whatsapp,
      'city', company_city,
      'state', company_state,
      'planName', plan_name,
      'status', subscription_status,
      'amount', new.valor,
      'currency', new.moeda,
      'paidAt', coalesce(new.paid_at, new.criado_em),
      'provider', new.provider,
      'paymentKind', payment_kind,
      'externalPaymentId', new.external_payment_id,
      'nextBillingDate', displayed_next_billing,
      'adminUrl', 'https://horaria.site/admin'
    ),
    'billing:payment:' || new.id::text || ':approved'
  )
  on conflict(unique_key) do nothing;

  return new;
end
$function$;

revoke all on function private.enqueue_admin_payment_email()
from public, anon, authenticated;

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
      e.slug as company_slug,
      coalesce(nullif(e.whatsapp, ''), nullif(e.telefone, '')) as company_whatsapp,
      e.cidade as company_city,
      e.estado as company_state,
      pf.nome as owner_name,
      pf.email as owner_email,
      pf.telefone as owner_phone,
      pl.nome as plan_name,
      a.id as assinatura_id,
      a.status as subscription_status,
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
    left join public.perfis pf on pf.usuario_id = e.dono_id
    left join public.planos pl on pl.id = a.plano_id
    where e.status not in ('CANCELED','PENDING_DELETION')
  )
  insert into public.admin_email_notifications(
    event_type,
    empresa_id,
    assinatura_id,
    recipient,
    subject,
    payload,
    unique_key
  )
  select
    'billing_grace_started',
    d.empresa_id,
    d.assinatura_id,
    cfg.admin_notification_email,
    'Assinatura entrou nas 24h de tolerância — ' || d.company_name,
    jsonb_build_object(
      'companyName', d.company_name,
      'companySlug', d.company_slug,
      'ownerName', d.owner_name,
      'ownerEmail', d.owner_email,
      'ownerPhone', d.owner_phone,
      'companyWhatsapp', d.company_whatsapp,
      'city', d.company_city,
      'state', d.company_state,
      'planName', d.plan_name,
      'status', d.effective_status,
      'subscriptionStatus', d.subscription_status,
      'dueAt', d.due_at,
      'graceEndsAt', d.due_at + make_interval(hours => cfg.billing_grace_hours),
      'graceHours', cfg.billing_grace_hours,
      'amountDue', case
        when d.has_approved_payment then cfg.monthly_payment_amount
        else cfg.initial_payment_amount
      end,
      'currency', 'BRL',
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

revoke all on function private.enqueue_admin_billing_due_notifications()
from public, anon, authenticated;
