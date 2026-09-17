begin;
create function private.auditar_diagnostico() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(new.empresa_id,new.ordem_id,'Diagnóstico atualizado','Testes e observações técnicas registrados',auth.uid(),'Equipe técnica');return new;end $$;
create trigger auditar_diagnostico after insert or update on public.diagnosticos for each row execute function private.auditar_diagnostico();
revoke all on function private.auditar_diagnostico() from public,anon,authenticated;
commit;
