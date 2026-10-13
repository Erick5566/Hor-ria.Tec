-- Nova contratação: PIX inicial já na entrada, 7 dias de bônus após
-- aprovação e primeiro mês contado somente após o bônus.
-- Não altera valores, datas nem status das assinaturas preexistentes.
begin;

alter table public.configuracoes_plataforma
  add column if not exists upfront_payment_effective_at timestamptz;

update public.configuracoes_plataforma
set upfront_payment_effective_at=now()
where id and upfront_payment_effective_at is null;

-- Calcula pagamento obrigatório apenas para contas criadas depois da mudança.
-- Evita bloquear trials iniciados antes desta implantação.
create or replace function private.effective_company_status(p_empresa uuid)
returns text language sql stable security definer set search_path='' as $status$
 select case
   when e.status in ('SUSPENDED','CANCELED','PENDING_DELETION') then e.status
   when a.id is null then e.status
   when a.status='CANCELED' then 'CANCELED'
   when a.status='SUSPENDED' then 'SUSPENDED'
   when a.status='TRIAL' then
     case
       when c.upfront_payment_effective_at is not null
         and e.criado_em >= c.upfront_payment_effective_at
         and not exists (select 1 from public.pagamentos pg
           where pg.assinatura_id=a.id and pg.status='APPROVED')
         then 'PENDING_PAYMENT'
       when a.trial_ends_at is null then 'SUSPENDED'
       when now() <= a.trial_ends_at then 'TRIAL'
       when now() <= a.trial_ends_at+make_interval(hours=>c.billing_grace_hours)
         then 'PAST_DUE'
       else 'SUSPENDED'
     end
   when a.status='ACTIVE' then
     case
       when a.next_billing_date is null or now() <= a.next_billing_date then 'ACTIVE'
       when now() <= a.next_billing_date+make_interval(hours=>c.billing_grace_hours) then 'PAST_DUE'
       else 'SUSPENDED'
     end
   when a.status='PAST_DUE' then
     case
       when now() <= coalesce(a.next_billing_date,a.trial_ends_at,a.atualizado_em)+make_interval(hours=>c.billing_grace_hours)
         then 'PAST_DUE'
       else 'SUSPENDED'
     end
   else e.status end
 from public.empresas e
 left join public.assinaturas a on a.empresa_id=e.id
 cross join public.configuracoes_plataforma c
 where e.id=p_empresa and c.id;
$status$;

-- Durante a criação, os serviços devem ser inseridos antes da assinatura,
-- evitando bloquear o setup pela própria regra de pagamento imediato.
create or replace function public.configurar_empresa(
  p_nome text,p_slug text,p_horario jsonb,p_endereco boolean,p_servicos jsonb
) returns uuid language plpgsql security definer set search_path='' as $setup$
declare empresa uuid;item jsonb;plano uuid;begin
 if auth.uid() is null then raise exception 'Entre na sua conta';end if;
 if exists(select 1 from public.empresa_membros where usuario_id=auth.uid() and status='ACTIVE') then raise exception 'Sua conta já possui uma empresa';end if;
 perform private.assert_registration_available();
 if jsonb_typeof(p_servicos)<>'array' or jsonb_array_length(p_servicos)<1 or jsonb_array_length(p_servicos)>50 then raise exception 'Cadastre entre 1 e 50 serviços';end if;
 insert into public.empresas(dono_id,nome,slug,horario,solicitar_endereco,status)
   values(auth.uid(),p_nome,p_slug,p_horario,p_endereco,'TRIAL') returning id into empresa;
 insert into public.empresa_membros(empresa_id,usuario_id,role)
   values(empresa,auth.uid(),'OWNER');
 for item in select * from jsonb_array_elements(p_servicos) loop
   insert into public.servicos(empresa_id,nome,duracao)
     values(empresa,item->>'nome',(item->>'duracao')::integer);
 end loop;
 select id into strict plano from public.planos where codigo='HORARIA' and ativo;
 insert into public.assinaturas(empresa_id,plano_id,status,trial_ends_at,next_billing_date)
   values(empresa,plano,'TRIAL',now()+interval '7 days',now()+interval '7 days');
 return empresa;
end $setup$;

-- Mesma idempotência, auditoria e controle de MFA do fluxo manual anterior.
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
  initial_amount numeric(12,2);
  monthly_amount numeric(12,2);
  payment_kind text;
  next_billing timestamptz;
  external_id text;
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform private.require_super_admin();

  if exists (
    select 1
    from private.admin_payment_confirmation_operations
    where confirmation_id = p_confirmation_id
      and empresa_id <> p_empresa
  ) or exists (
    select 1
    from public.pagamentos
    where provider = 'manual_pix'
      and external_payment_id = 'manual_pix:' || p_confirmation_id::text
      and empresa_id <> p_empresa
  ) then
    raise exception 'Identificador pertence a outra empresa';
  end if;

  if p_confirmation_id is null then
    raise exception 'Identificador da confirmação não informado';
  end if;

  if length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'A observação deve ter no máximo 1000 caracteres';
  end if;

  select
    case when p.codigo='HORARIA_PRO' then 80.00 else c.initial_payment_amount end,
    case when p.codigo='HORARIA_PRO' then 80.00 else c.monthly_payment_amount end
  into strict initial_amount,monthly_amount
  from public.configuracoes_plataforma c
  join public.assinaturas a on a.empresa_id=p_empresa
  join public.planos p on p.id=a.plano_id
  where c.id;

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
    next_billing := now() + interval '7 days' + interval '1 month';
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
      started_at = case when payment_kind='initial' then now()+interval '7 days' else subscription.started_at end,
      trial_ends_at = case when payment_kind='initial' then now()+interval '7 days' else subscription.trial_ends_at end,
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
    raise exception 'Assinatura ou configuração de cobrança não encontrada';
end
$function$;

revoke all on function public.admin_confirm_manual_payment(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.admin_confirm_manual_payment(uuid, uuid, text)
to authenticated;


-- Validação dos pagamentos por webhook, com período bônus garantido.
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
    select case
      when p.codigo='HORARIA_PRO' then 80.00
      when has_approved_payment then c.monthly_payment_amount
      else c.initial_payment_amount end
      into strict expected_amount
      from public.configuracoes_plataforma c
      join public.planos p on p.id=subscription.plano_id
      where c.id;
    if p_amount is distinct from expected_amount then
      raise exception 'Valor divergente da cobrança configurada';
    end if;
    -- O primeiro PIX já paga o mês contratado. Os 7 dias são bônus extras.
    -- A data enviada pelo gateway não pode encurtar esse primeiro período.
    next_billing := case when has_approved_payment
      then coalesce(p_next_billing,
        greatest(subscription.next_billing_date,now()) + interval '1 month')
      else now() + interval '7 days' + interval '1 month' end;
    if not isfinite(next_billing) or next_billing <= now()
       or (has_approved_payment and next_billing <= subscription.next_billing_date) then
      raise exception 'Próximo vencimento inválido';
    end if;

    update public.assinaturas set
      status=case when company_status in ('SUSPENDED','CANCELED') then company_status else 'ACTIVE' end,
      external_subscription_id=coalesce(p_external_subscription,external_subscription_id),
      next_billing_date=next_billing,
      started_at=case when has_approved_payment then subscription.started_at else now()+interval '7 days' end,
      trial_ends_at=case when has_approved_payment then subscription.trial_ends_at else now()+interval '7 days' end,
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


commit;
