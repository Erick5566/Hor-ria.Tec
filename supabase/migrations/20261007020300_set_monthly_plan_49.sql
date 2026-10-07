begin;

alter table public.configuracoes_plataforma
  alter column monthly_payment_amount set default 49.00;

update public.configuracoes_plataforma
set monthly_payment_amount = 49.00
where id
  and monthly_payment_amount is distinct from 49.00;

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
    c.initial_payment_amount,
    c.monthly_payment_amount
  into strict
    initial_amount,
    monthly_amount
  from public.configuracoes_plataforma c
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
    raise exception 'Assinatura ou configuração de cobrança não encontrada';
end
$function$;

revoke all on function public.admin_confirm_manual_payment(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.admin_confirm_manual_payment(uuid, uuid, text)
to authenticated;

commit;
