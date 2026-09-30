-- Validate edited delivery dates without rewriting existing orders or changing access.
create or replace function private.validate_receipt_delivery() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.previsao is distinct from old.previsao then
    if new.previsao < (new.criado_em at time zone 'America/Fortaleza')::date then
      raise exception 'A entrega não pode ser anterior à data de recebimento.';
    end if;
  end if;
  if TG_OP = 'INSERT' or new.prazo_previsto is distinct from old.prazo_previsto then
    if (new.prazo_previsto at time zone 'America/Fortaleza')::date < (new.criado_em at time zone 'America/Fortaleza')::date then
      raise exception 'O prazo não pode ser anterior à data de recebimento.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_receipt_delivery() from public, anon, authenticated;
create trigger validate_receipt_delivery before insert or update of previsao, prazo_previsto
on public.ordens_servico for each row execute function private.validate_receipt_delivery();
