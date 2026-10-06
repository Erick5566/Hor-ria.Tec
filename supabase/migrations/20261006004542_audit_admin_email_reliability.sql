-- Recover interrupted workers without resending outside Resend's 24-hour idempotency window.
alter table public.admin_email_notifications
  add column if not exists processing_token uuid,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists requires_review boolean not null default false;

create or replace function private.retry_admin_email_notifications()
returns integer language plpgsql security definer set search_path = ''
as $function$
declare dispatch_url text; item record; queued integer := 0;
begin
  select nullif(trim(c.admin_email_dispatch_url), '') into dispatch_url
  from public.configuracoes_plataforma c where c.id;
  if dispatch_url is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return 0; end if;

  update public.admin_email_notifications n
  set status='failed', processing_token=null, updated_at=now(),
      last_error='Worker interrompido; envio pendente de recuperação',
      requires_review=n.requires_review
        or coalesce(n.delivery_started_at,n.last_attempt_at,n.created_at) <= now()-interval '23 hours'
  where n.status='processing'
    and coalesce(n.last_attempt_at,n.updated_at,n.created_at) <= now()-interval '10 minutes';

  update public.admin_email_notifications n
  set requires_review=true, updated_at=now(),last_error='Janela de idempotência expirada; conferir entrega no provedor antes de reenviar'
  where n.status in ('pending','failed') and not n.requires_review
    and n.delivery_started_at <= now()-interval '23 hours';

  for item in
    select n.id,n.dispatch_token from public.admin_email_notifications n
    where n.status in ('pending','failed') and not n.requires_review
      and (n.last_attempt_at is null or n.last_attempt_at <= now()-interval '10 minutes')
    order by n.last_attempt_at nulls first,n.created_at limit 20 for update skip locked
  loop
    begin
      update public.admin_email_notifications set last_attempt_at=now(),updated_at=now() where id=item.id;
      perform net.http_post(url:=dispatch_url,
        body:=jsonb_build_object('id',item.id,'dispatchToken',item.dispatch_token),
        headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=5000);
      queued:=queued+1;
    exception when others then
      raise warning 'Falha ao reenfileirar e-mail administrativo %: %',item.id,sqlerrm;
    end;
  end loop;
  return queued;
end
$function$;
revoke all on function private.retry_admin_email_notifications() from public,anon,authenticated;

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
  due_at timestamptz;
  grace_hours integer;
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
    c.admin_notification_email,
    case when a.status = 'TRIAL' then a.trial_ends_at else coalesce(a.next_billing_date,a.trial_ends_at) end,
    c.billing_grace_hours
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
    recipient_email,
    due_at,
    grace_hours
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
      'status', case when new.provider = 'manual_pix' then 'ACTIVE' else subscription_status end,
      'dueAt', due_at,
      'graceEndsAt', due_at + make_interval(hours => grace_hours),
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


create or replace function public.admin_email_provider_credentials()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  resend_key text;
  sender text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return jsonb_build_object(
      'resendApiKey', null,
      'from', 'Horária <notificacoes@horaria.site>'
    );
  end if;

  execute $sql$
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'horaria_resend_api_key'
    order by created_at desc
    limit 1
  $sql$ into resend_key;

  execute $sql$
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'horaria_admin_email_from'
    order by created_at desc
    limit 1
  $sql$ into sender;

  return jsonb_build_object(
    'resendApiKey', resend_key,
    'from', coalesce(nullif(trim(sender), ''), 'Horária <notificacoes@horaria.site>')
  );
end
$function$;

revoke all on function public.admin_email_provider_credentials()
from public, anon, authenticated;
grant execute on function public.admin_email_provider_credentials()
to service_role;
