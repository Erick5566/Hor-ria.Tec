begin;
create or replace function private.register_finalized_order_income()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  approved_total numeric;
  recorded_total numeric;
  remaining_total numeric;
begin
  if new.status <> 'finalizado' or old.status = 'finalizado'
     or not private.feature_enabled(new.empresa_id, 'financialEnabled') then
    return new;
  end if;

  select q.total into approved_total
  from public.orcamentos q
  where q.ordem_id = new.id and q.empresa_id = new.empresa_id
    and q.status <> 'rascunho'
  order by q.versao desc
  limit 1;

  if approved_total is null or approved_total <= 0 then return new; end if;

  select coalesce(sum(f.valor), 0) into recorded_total
  from public.financeiro f
  where f.ordem_id = new.id and f.empresa_id = new.empresa_id
    and f.tipo = 'receita';

  remaining_total := round(approved_total - recorded_total, 2);
  if remaining_total <= 0 then return new; end if;

  insert into public.financeiro(
    empresa_id, ordem_id, descricao, tipo, valor, status, vencimento, origem
  ) values (
    new.empresa_id, new.id, 'Reparo da OS #' || new.numero,
    'receita', remaining_total, 'pendente', current_date, 'reparo'
  );
  return new;
end
$function$;

revoke all on function private.register_finalized_order_income()
from public, anon, authenticated;

create trigger register_finalized_order_income
after update of status on public.ordens_servico
for each row when (new.status = 'finalizado' and old.status is distinct from new.status)
execute function private.register_finalized_order_income();
commit;


