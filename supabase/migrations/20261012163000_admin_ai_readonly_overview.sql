-- Admin Horária IA: visão SOMENTE LEITURA sobre saldo, uso e pendências.
-- Não cria pagamentos, não adiciona créditos, não aciona OpenAI.
begin;
create or replace function public.admin_ai_overview()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Verificação em duas etapas necessária para visualizar créditos de IA';
  end if;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'companiesWithWallet',(select count(*) from private.ai_credit_wallets),
      'availableUnits',coalesce((select sum(available_units) from private.ai_credit_wallets),0),
      'consumedUnits',coalesce((select sum(consumed_units) from private.ai_credit_wallets),0),
      'topUpUnits',coalesce((select sum(units) from private.ai_credit_topups),0),
      'pendingCount',(select count(*) from private.ai_message_reservations where status='RESERVED'),
      'requiresReview',(select count(*) from private.ai_message_reservations
         where status='RESERVED' and provider_started_at is not null
           and reserved_at < now()-interval '10 minutes'),
      'waitingToStart',(select count(*) from private.ai_message_reservations
         where status='RESERVED' and provider_started_at is null)
    ),
    'companies',coalesce((
      select jsonb_agg(to_jsonb(x) order by x."companyName",x.id)
      from (
        select e.id,e.nome as "companyName",e.slug,e.status,
          coalesce(w.available_units,0) as "availableUnits",
          coalesce(w.consumed_units,0) as "consumedUnits",
          (select count(*) from private.ai_message_reservations r
            where r.empresa_id=e.id and r.status='RESERVED') as "pendingCount"
        from public.empresas e
        left join private.ai_credit_wallets w on w.empresa_id=e.id
        where w.empresa_id is not null or exists (
          select 1 from private.ai_message_reservations r where r.empresa_id=e.id
        )
        order by e.nome,e.id
        limit 150
      ) x
    ),'[]'::jsonb),
    'pending',coalesce((
      select jsonb_agg(to_jsonb(x) order by x."reservedAt",x.id)
      from (
        select r.id,r.empresa_id as "companyId",
          e.nome as "companyName",r.channel,r.status,
          r.reserved_at as "reservedAt",r.provider_started_at as "providerStartedAt",
          case
            when r.provider_started_at is not null then 'PROVIDER_STARTED'
            when r.reserved_at < now()-interval '10 minutes' then 'NEVER_STARTED_STALE'
            else 'AWAITING_PROVIDER'
          end as "reviewState"
        from private.ai_message_reservations r
        join public.empresas e on e.id=r.empresa_id
        where r.status='RESERVED'
        order by r.reserved_at,r.id
        limit 60
      ) x
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.admin_ai_overview() from public,anon;
grant execute on function public.admin_ai_overview() to authenticated;
commit;
