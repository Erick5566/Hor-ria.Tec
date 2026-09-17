-- Execute em uma única conexão. Fixtures são SEMPRE revertidas por ROLLBACK.
begin;
select set_config('qa.owner_a',gen_random_uuid()::text,true),set_config('qa.owner_b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('qa.owner_a')::uuid),(current_setting('qa.owner_b')::uuid);
insert into public.empresas(dono_id,nome,slug) values(current_setting('qa.owner_a')::uuid,'QA rollback A','qa-'||current_setting('qa.owner_a')),(current_setting('qa.owner_b')::uuid,'QA rollback B','qa-'||current_setting('qa.owner_b'));
select set_config('qa.empresa_a',(select id::text from public.empresas where dono_id=current_setting('qa.owner_a')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.owner_a'),true);
select set_config('qa.ordem',public.criar_ordem(current_setting('qa.empresa_a')::uuid,'{"nome":"QA rollback","whatsapp":"11999999999"}','{"categoria":"Celular","modelo":"QA"}','{"problema":"Teste transacional"}')::text,true);
do $$begin
 if not exists(select 1 from public.ordens_servico where id=current_setting('qa.ordem')::uuid) then raise exception 'Dono não acessou a própria ordem';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.owner_b'),true);
do $$begin
 if exists(select 1 from public.ordens_servico where id=current_setting('qa.ordem')::uuid) then raise exception 'Vazamento entre empresas';end if;
 if exists(select 1 from public.clientes where empresa_id=current_setting('qa.empresa_a')::uuid) then raise exception 'Vazamento de clientes';end if;
 if exists(select 1 from public.historico_os where ordem_id=current_setting('qa.ordem')::uuid) then raise exception 'Vazamento de histórico';end if;
 update public.ordens_servico set problema='Alteração não autorizada' where id=current_setting('qa.ordem')::uuid;
 if found then raise exception 'Atualização entre tenants permitida';end if;
end $$;
reset role;
set local role anon;
do $$begin
 if has_table_privilege('anon','public.ordens_servico','SELECT') or has_table_privilege('anon','public.clientes','SELECT') or has_table_privilege('anon','public.fotos_os','SELECT') then raise exception 'Leitura pública indevida';end if;
end $$;
reset role;
rollback;
select 'Isolamento validado; fixtures revertidas' as resultado;
