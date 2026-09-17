begin;

create or replace function public.process_billing_event(
 p_provider text,p_event_id text,p_event_type text,p_empresa uuid,
 p_external_subscription text default null,p_external_payment text default null,
 p_next_billing timestamptz default null,p_amount numeric default null,
 p_currency text default 'BRL',p_payload jsonb default '{}'::jsonb
) returns boolean language sql security definer set search_path='' as $$
 select private.process_billing_event(p_provider,p_event_id,p_event_type,p_empresa,p_external_subscription,p_external_payment,p_next_billing,p_amount,p_currency,p_payload)
$$;

revoke all on function public.process_billing_event(text,text,text,uuid,text,text,timestamptz,numeric,text,jsonb) from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.process_billing_event(text,text,text,uuid,text,text,timestamptz,numeric,text,jsonb) to service_role;
 end if;
end $$;

commit;
