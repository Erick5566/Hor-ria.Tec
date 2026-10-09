-- Additive correction only: no existing records, prices or trial settings change.
begin;

create or replace function private.process_billing_event(
  p_provider text, p_event_id text, p_event_type text, p_empresa uuid,
  p_external_subscription text default null, p_external_payment text default null,
  p_next_billing timestamptz default null, p_amount numeric default null,
  p_currency text default 'BRL', p_payload jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  event_row uuid;
  subscription public.assinaturas;
  existing_payment public.pagamentos;
  expected_amount numeric;
  next_billing timestamptz;
  has_approved_payment boolean;
  company_status text;
begin
  if nullif(trim(p_provider),'') is null or nullif(trim(p_event_id),'') is null
     or p_empresa is null or p_event_type is null then
    raise exception 'Evento incompleto';
  end if;

  insert into public.eventos_webhook(provider,event_id,event_type,payload)
  values(p_provider,p_event_id,p_event_type,p_payload)
  on conflict(provider,event_id) do nothing returning id into event_row;
  if event_row is null then return false; end if;

  -- Match the administrative lock order (company, then subscription).
  select status into strict company_status from public.empresas where id=p_empresa for update;
  select * into strict subscription from public.assinaturas where empresa_id=p_empresa for update;
  if subscription.external_subscription_id is not null
     and p_external_subscription is not null
     and subscription.external_subscription_id <> p_external_subscription then
    raise exception 'Assinatura externa divergente';
  end if;

  if p_external_payment is not null then
    -- Serialize the same provider payment even across different companies.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider||':'||p_external_payment,0));
    select * into existing_payment from public.pagamentos
      where provider=p_provider and external_payment_id=p_external_payment for update;
    if found and existing_payment.empresa_id <> p_empresa then
      raise exception 'Pagamento pertence a outra empresa';
    end if;
    if existing_payment.status='APPROVED' and p_event_type in ('payment.approved','payment.failed','payment.past_due') then
      update public.eventos_webhook set status='IGNORED',processado_em=now() where id=event_row;
      return false;
    end if;
  end if;

  if p_event_type='payment.approved' then
    if nullif(trim(p_external_payment),'') is null or p_amount is null
       or p_amount <= 0 or p_currency is distinct from 'BRL' then
      raise exception 'Pagamento aprovado incompleto ou inválido';
    end if;
    select exists(select 1 from public.pagamentos where assinatura_id=subscription.id and status='APPROVED') into has_approved_payment;
    select case when has_approved_payment then monthly_payment_amount else initial_payment_amount end
      into strict expected_amount from public.configuracoes_plataforma where id;
    if p_amount is distinct from expected_amount then
      raise exception 'Valor divergente da cobrança configurada';
    end if;
    next_billing := coalesce(p_next_billing, case when has_approved_payment
      then greatest(subscription.next_billing_date,now()) + interval '1 month'
      else now() + interval '7 days' end);
    if not isfinite(next_billing) or next_billing <= now()
       or (has_approved_payment and next_billing <= subscription.next_billing_date) then
      raise exception 'Próximo vencimento inválido';
    end if;

    update public.assinaturas set
      status=case when company_status in ('SUSPENDED','CANCELED') then company_status else 'ACTIVE' end,
      external_subscription_id=coalesce(p_external_subscription,external_subscription_id),
      next_billing_date=next_billing,
      cancelled_at=case when company_status='CANCELED' then cancelled_at else null end,
      atualizado_em=now() where id=subscription.id;
    update public.empresas set status='ACTIVE',scheduled_deletion_at=null,atualizado_em=now()
      where id=p_empresa and status not in ('SUSPENDED','CANCELED');

    -- A late success upgrades an earlier rejection instead of losing the payment.
    insert into public.pagamentos(empresa_id,assinatura_id,provider,external_payment_id,valor,moeda,status,paid_at,payload)
    values(p_empresa,subscription.id,p_provider,p_external_payment,p_amount,p_currency,'APPROVED',now(),p_payload)
    on conflict(provider,external_payment_id) do update
      set status='APPROVED',valor=excluded.valor,moeda=excluded.moeda,paid_at=excluded.paid_at,payload=excluded.payload;

  elsif p_event_type='subscription.created' then
    -- Creating a provider subscription is not evidence of a settled payment.
    update public.assinaturas set external_subscription_id=coalesce(p_external_subscription,external_subscription_id),atualizado_em=now()
      where id=subscription.id;
  elsif p_event_type in ('payment.failed','payment.past_due') then
    if p_external_payment is not null then
      insert into public.pagamentos(empresa_id,assinatura_id,provider,external_payment_id,valor,moeda,status,payload)
      values(p_empresa,subscription.id,p_provider,p_external_payment,p_amount,p_currency,'REJECTED',p_payload)
      on conflict(provider,external_payment_id) do nothing;
    end if;
    -- Failed attempts must not shorten an already paid period or a trial.
    if coalesce(case when subscription.status='TRIAL' then subscription.trial_ends_at else subscription.next_billing_date end,now()) <= now() then
      update public.assinaturas set status='PAST_DUE',atualizado_em=now()
        where id=subscription.id and status not in ('SUSPENDED','CANCELED');
      update public.empresas set status='PAST_DUE',atualizado_em=now()
        where id=p_empresa and status not in ('SUSPENDED','CANCELED');
    end if;
  elsif p_event_type='subscription.canceled' then
    update public.assinaturas set status='CANCELED',cancelled_at=now(),atualizado_em=now() where id=subscription.id;
    update public.empresas set status='CANCELED',scheduled_deletion_at=now()+interval '30 days',atualizado_em=now() where id=p_empresa;
  else
    update public.eventos_webhook set status='IGNORED',processado_em=now() where id=event_row;
    return true;
  end if;
  update public.eventos_webhook set status='PROCESSED',processado_em=now() where id=event_row;
  return true;
end $$;

revoke all on function private.process_billing_event(text,text,text,uuid,text,text,timestamptz,numeric,text,jsonb) from public,anon,authenticated;
commit;
