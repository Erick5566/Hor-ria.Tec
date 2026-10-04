-- Fixtures only. Everything is rolled back; pg_net dispatches only after commit.
begin;
do $audit$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  attendant uuid := gen_random_uuid();
  company_a uuid;
  company_b uuid;
  order_a uuid;
  quote_a uuid;
  token_a uuid;
  tracking jsonb;
  blocked boolean;
  row_count integer;
begin
  insert into auth.users(id) values(owner_a),(owner_b),(attendant);
  update public.perfis set nome='Auditoria',email='audit@example.invalid'
    where usuario_id in (owner_a,owner_b,attendant);
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
  set local role authenticated;
  company_a := public.configurar_empresa('Auditoria A','audit-'||owner_a::text,'{}',false,'[{"nome":"Reparo","duracao":30}]');
  reset role;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  set local role authenticated;
  company_b := public.configurar_empresa('Auditoria B','audit-'||owner_b::text,'{}',false,'[{"nome":"Reparo","duracao":30}]');
  if exists(select 1 from public.empresas where id=company_a) then
    raise exception 'Tenant B can read tenant A';
  end if;
  reset role;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  set local role service_role;
  perform public.link_team_member(owner_a,attendant,'Atendente','audit@example.invalid','ATTENDANT');
  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
  set local role authenticated;
  order_a := public.criar_ordem(company_a,'{"nome":"Cliente Auditoria","whatsapp":"11900000000"}',
    '{"categoria":"Celular","marca":"Teste","modelo":"Auditoria","cor":"Preto","senha":"AUDIT_SECRET"}',
    '{"problema":"Tela quebrada"}');
  select token_acompanhamento into token_a from public.ordens_servico where id=order_a;
  perform public.confirmar_entrada(order_a);
  insert into public.diagnosticos(ordem_id,empresa_id,observacoes)
    values(order_a,company_a,'AUDIT_INTERNAL');
  quote_a := public.salvar_orcamento(order_a,'[]','[{"nome":"Tela","quantidade":1,"valor":220}]',80,0,current_date+7);
  if (select total from public.orcamentos where id=quote_a) <> 300 then
    raise exception 'Quote total is not 300';
  end if;
  perform public.enviar_orcamento(quote_a);
  reset role;
  perform set_config('request.jwt.claim.sub',attendant::text,true);
  set local role authenticated;
  if exists(select 1 from public.equipamento_segredos where ordem_id=order_a)
     or exists(select 1 from public.diagnosticos where ordem_id=order_a)
     or exists(select 1 from public.orcamentos where id=quote_a) then
    raise exception 'Attendant can read technical secrets';
  end if;
  blocked := false;
  begin
    perform public.admin_platform_overview();
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'Common user can call admin'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  set local role authenticated;
  if exists(select 1 from public.ordens_servico where id=order_a) then
    raise exception 'Tenant B can read order A';
  end if;
  update public.ordens_servico set problema='Cross tenant' where id=order_a;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Tenant B can update order A'; end if;
  blocked := false;
  begin
    perform public.criar_ordem(company_a,'{"nome":"Intruso","whatsapp":"11900000000"}',
      '{"categoria":"Celular","modelo":"Teste"}','{"problema":"Intrusão"}');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'Tenant B can insert into A'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  set local role service_role;
  tracking := public.acompanhar_por_token(token_a);
  if tracking->'orcamento'->>'id' <> quote_a::text
     or tracking::text like '%AUDIT_SECRET%'
     or tracking::text like '%AUDIT_INTERNAL%' then
    raise exception 'Public tracking leaks or mixes data';
  end if;
  if public.acompanhar_por_token(gen_random_uuid()) is not null then
    raise exception 'Unknown tracking token returns data';
  end if;
  perform public.responder_orcamento_link(quote_a,'aprovado',null,token_a);
  blocked := false;
  begin
    perform public.responder_orcamento_link(quote_a,'aprovado',null,token_a);
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'Closed quote accepts another response'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
  set local role authenticated;
  update public.ordens_servico set status='em_reparo' where id=order_a;
  update public.ordens_servico set status='em_testes' where id=order_a;
  update public.ordens_servico set status='pronto_retirada' where id=order_a;
  update public.ordens_servico set status='finalizado' where id=order_a;
  update public.ordens_servico set status='finalizado' where id=order_a;
  if (select count(*) from public.financeiro where ordem_id=order_a and tipo='receita') <> 1 then
    raise exception 'Finalization creates missing or duplicate income';
  end if;
  if (select valor from public.financeiro where ordem_id=order_a and tipo='receita') <> 300 then
    raise exception 'Income differs from quote';
  end if;
  if not exists(select 1 from public.diagnosticos where ordem_id=order_a and observacoes='AUDIT_INTERNAL') then
    raise exception 'Finalization erases diagnosis';
  end if;
  reset role;
end
$audit$;
rollback;

