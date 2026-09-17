begin;
create function public.validar_expediente() returns trigger language plpgsql set search_path='' as $$
declare dia text; janela jsonb;
begin
 if jsonb_typeof(new.horario) <> 'object' then raise exception 'Expediente inválido'; end if;
 for dia,janela in select * from jsonb_each(new.horario) loop
  if dia !~ '^[0-6]$' or jsonb_typeof(janela)<>'array' or jsonb_array_length(janela)<>2 then raise exception 'Dia inválido'; end if;
  if (janela->>0) is null or (janela->>1) is null or (janela->>0) !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' or (janela->>1) !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' or (janela->>0)::time >= (janela->>1)::time then raise exception 'Informe horários válidos em intervalos de 15 minutos'; end if;
 end loop;
 return new;
end $$;
create trigger expediente before insert or update on public.empresas for each row execute function public.validar_expediente();
revoke all on function public.validar_expediente() from public;
commit;
