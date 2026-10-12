-- Saldo de IA selecionado explicitamente pela assistência ativa na sessão.
-- A função anterior permanece para compatibilidade, mas não deve ser usada no painel.
begin;
create or replace function public.ai_credit_status_for_company(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_empresa is null then
    raise exception 'Autenticação e empresa necessárias';
  end if;
  if not exists (
    select 1 from public.empresa_membros m
    where m.empresa_id=p_empresa and m.usuario_id=v_actor and m.status='ACTIVE'
  ) then
    raise exception 'Sem acesso aos créditos desta assistência';
  end if;
  return jsonb_build_object(
    'empresaId',p_empresa,
    'availableUnits',coalesce(
      (select w.available_units from private.ai_credit_wallets w where w.empresa_id=p_empresa),0),
    'consumedUnits',coalesce(
      (select w.consumed_units from private.ai_credit_wallets w where w.empresa_id=p_empresa),0),
    'unit','uma resposta de IA',
    'whatsappIncluded',false
  );
end $$;
revoke all on function public.ai_credit_status_for_company(uuid) from public,anon;
grant execute on function public.ai_credit_status_for_company(uuid) to authenticated;
commit;
