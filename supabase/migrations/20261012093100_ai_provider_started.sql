-- Marcar início da chamada externa. A recuperação automática só devolve
-- reservas que NUNCA chegaram a ser enviadas ao provedor.
-- Isso reduz o risco de uso pago sem crédito ao reiniciar a função serverless.
begin;
alter table private.ai_message_reservations
  add column if not exists provider_started_at timestamptz;

create or replace function public.ai_mark_provider_started(
  p_reservation uuid, p_empresa uuid, p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_reservation is null or p_empresa is null or p_actor is null then
    raise exception 'Reserva inválida';
  end if;
  update private.ai_message_reservations
  set provider_started_at=now()
  where id=p_reservation and empresa_id=p_empresa and actor_id=p_actor
    and status='RESERVED' and provider_started_at is null;
  return found;
end $$;

revoke all on function public.ai_mark_provider_started(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_mark_provider_started(uuid,uuid,uuid) to service_role;

create or replace function public.ai_refund_stale_messages(p_empresa uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  with refunded as (
    update private.ai_message_reservations
    set status='REFUNDED',settled_at=now()
    where empresa_id=p_empresa and status='RESERVED'
      and provider_started_at is null
      and reserved_at < now()-interval '10 minutes'
    returning id
  )
  select count(*) into v_count from refunded;
  if v_count>0 then
    update private.ai_credit_wallets
    set available_units=available_units+v_count,updated_at=now()
    where empresa_id=p_empresa;
  end if;
  return v_count;
end $$;
revoke all on function public.ai_refund_stale_messages(uuid) from public,anon,authenticated;
grant execute on function public.ai_refund_stale_messages(uuid) to service_role;
commit;
