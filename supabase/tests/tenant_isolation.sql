-- Execute no SQL Editor/psql. Tudo é revertido, inclusive os usuários de teste.
begin;
do $$
declare ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); ea uuid; eb uuid; sa uuid; sb uuid;
begin
 insert into auth.users(id) values(ua),(ub);
 insert into public.empresas(dono_id,nome,slug,horario) values(ua,'Teste A','teste-'||ua,'{"0":["09:00","18:00"],"1":["09:00","18:00"],"2":["09:00","18:00"],"3":["09:00","18:00"],"4":["09:00","18:00"],"5":["09:00","18:00"],"6":["09:00","18:00"]}') returning id into ea;
 insert into public.empresas(dono_id,nome,slug) values(ub,'Teste B','teste-'||ub) returning id into eb;
 insert into public.empresa_membros(empresa_id,usuario_id,role,status)
 values(ea,ua,'OWNER','ACTIVE'),(eb,ub,'OWNER','ACTIVE');
 insert into public.servicos(empresa_id,nome,duracao) values(ea,'Serviço A',30) returning id into sa;
 insert into public.servicos(empresa_id,nome,duracao) values(eb,'Serviço B',30) returning id into sb;
 perform set_config('horaria.ua',ua::text,true); perform set_config('horaria.ub',ub::text,true);
 perform set_config('horaria.ea',ea::text,true); perform set_config('horaria.eb',eb::text,true);
 perform set_config('horaria.sa',sa::text,true); perform set_config('horaria.sb',sb::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('horaria.ua'),true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.empresas)<>1 then raise exception 'FAIL: leitura entre empresas'; end if;
 if exists(select 1 from public.servicos where empresa_id=current_setting('horaria.eb')::uuid) then raise exception 'FAIL: serviços de outra empresa'; end if;
 update public.empresas set nome='Invasão' where id=current_setting('horaria.eb')::uuid;
 if found then raise exception 'FAIL: atualização entre empresas'; end if;
 begin
  insert into public.servicos(empresa_id,nome,duracao) values(current_setting('horaria.eb')::uuid,'Invasão',30);
  raise exception 'FAIL: inserção entre empresas';
 exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
declare inicio_teste timestamptz:=((current_date+1)+time '09:00') at time zone 'America/Sao_Paulo';
begin
 begin perform * from public.agendamentos; raise exception 'FAIL: leitura pública de clientes'; exception when insufficient_privilege then null; end;
 begin perform * from public.empresas; raise exception 'FAIL: leitura pública de donos'; exception when insufficient_privilege then null; end;
 insert into public.agendamentos(empresa_id,servico_id,nome_cliente,telefone,inicio) values(current_setting('horaria.ea')::uuid,current_setting('horaria.sa')::uuid,'Cliente teste','11999999999',inicio_teste);
 begin
  insert into public.agendamentos(empresa_id,servico_id,nome_cliente,telefone,inicio) values(current_setting('horaria.ea')::uuid,current_setting('horaria.sa')::uuid,'Sobreposição','11999999999',inicio_teste+interval '15 minutes');
  raise exception 'FAIL: sobreposição aceita';
 exception when exclusion_violation then null; end;
 begin update public.agendamentos set status='concluido'; raise exception 'FAIL: atualização pública'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('horaria.ub'),true);
set local role authenticated;
do $$
begin
 if exists(select 1 from public.agendamentos) then raise exception 'FAIL: dono B lê reserva de A'; end if;
end $$;
reset role;
select 'PASS: RLS, leitura/escrita entre tenants, reserva anônima e conflito de horários' as resultado;
rollback;
