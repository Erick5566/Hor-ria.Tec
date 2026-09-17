-- RLS por vínculo de membro, bloqueios operacionais e proteção das rotas públicas.
begin;

create or replace function private.feature_enabled(p_empresa uuid,p_feature text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(((c.feature_flags||e.feature_flags)->>p_feature)::boolean,false)
 from public.empresas e cross join public.configuracoes_plataforma c
 where e.id=p_empresa and c.id
$$;

revoke all on function private.feature_enabled(uuid,text) from public,anon,authenticated;
grant execute on function private.feature_enabled(uuid,text) to anon,authenticated;

do $$declare tabela text;politica record;begin
 foreach tabela in array array['empresas','servicos','agendamentos','clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','orcamentos','fotos_os','historico_os','financeiro','movimentos_estoque','pecas_aplicadas','notificacoes'] loop
  for politica in select policyname from pg_policies where schemaname='public' and tablename=tabela loop
   execute format('drop policy if exists %I on public.%I',politica.policyname,tabela);
  end loop;
 end loop;
end $$;

create policy empresa_membro_select on public.empresas for select to authenticated using(private.can_access_company(id));
create policy empresa_gestor_update on public.empresas for update to authenticated using(private.can_access_company(id) and private.can_manage_company(id)) with check(private.can_access_company(id) and private.can_manage_company(id));

do $$declare tabela text;condicao text;begin
 foreach tabela in array array['servicos','agendamentos','clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','orcamentos','fotos_os','historico_os','financeiro','movimentos_estoque','pecas_aplicadas','notificacoes'] loop
  condicao:='private.can_access_company(empresa_id)';
  if tabela='agendamentos' then condicao:=condicao||' and private.feature_enabled(empresa_id,''appointmentsEnabled'')';end if;
  if tabela='financeiro' then condicao:=condicao||' and private.feature_enabled(empresa_id,''financialEnabled'')';end if;
  if tabela in ('pecas','movimentos_estoque','pecas_aplicadas') then condicao:=condicao||' and private.feature_enabled(empresa_id,''stockEnabled'')';end if;
  execute format('create policy tenant_member_select on public.%I for select to authenticated using(%s)',tabela,condicao);
 end loop;
end $$;

create policy servicos_member_insert on public.servicos for insert to authenticated with check(private.can_access_company(empresa_id));
create policy servicos_member_update on public.servicos for update to authenticated using(private.can_access_company(empresa_id)) with check(private.can_access_company(empresa_id));
create policy servicos_member_delete on public.servicos for delete to authenticated using(private.can_access_company(empresa_id));

create policy agendamentos_member_insert on public.agendamentos for insert to authenticated with check(private.can_access_company(empresa_id) and private.feature_enabled(empresa_id,'appointmentsEnabled'));
create policy agendamentos_member_update on public.agendamentos for update to authenticated using(private.can_access_company(empresa_id) and private.feature_enabled(empresa_id,'appointmentsEnabled')) with check(private.can_access_company(empresa_id) and private.feature_enabled(empresa_id,'appointmentsEnabled'));
create policy agendamentos_member_delete on public.agendamentos for delete to authenticated using(private.can_access_company(empresa_id) and private.feature_enabled(empresa_id,'appointmentsEnabled'));
create policy agendamentos_public_insert on public.agendamentos for insert to anon with check(not bloqueio and status='aguardando' and private.public_company_available(empresa_id) and private.feature_enabled(empresa_id,'appointmentsEnabled'));

do $$declare tabela text;condicao text;begin
 foreach tabela in array array['clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','financeiro'] loop
  condicao:='private.can_access_company(empresa_id)';
  if tabela='financeiro' then condicao:=condicao||' and private.feature_enabled(empresa_id,''financialEnabled'')';end if;
  if tabela='pecas' then condicao:=condicao||' and private.feature_enabled(empresa_id,''stockEnabled'')';end if;
  execute format('create policy tenant_member_insert on public.%I for insert to authenticated with check(%s)',tabela,condicao);
  execute format('create policy tenant_member_update on public.%I for update to authenticated using(%s) with check(%s)',tabela,condicao,condicao);
 end loop;
end $$;

create or replace function private.enforce_operational_company_write() returns trigger language plpgsql security definer set search_path='' as $$
declare empresa uuid;feature text;begin
 empresa:=coalesce((to_jsonb(new)->>'empresa_id')::uuid,(to_jsonb(old)->>'empresa_id')::uuid);
 if auth.uid() is null then
  if not private.public_company_available(empresa) then raise exception 'Esta assistência está temporariamente indisponível';end if;
 else
  if not private.can_access_company(empresa) then raise exception 'Empresa indisponível ou acesso não autorizado';end if;
 end if;
 feature:=case when tg_table_name='agendamentos' then 'appointmentsEnabled' when tg_table_name='financeiro' then 'financialEnabled' when tg_table_name in ('pecas','movimentos_estoque','pecas_aplicadas') then 'stockEnabled' else null end;
 if feature is not null and not private.feature_enabled(empresa,feature) then raise exception 'Este recurso está temporariamente indisponível';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

do $$declare tabela text;begin
 foreach tabela in array array['servicos','agendamentos','clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','orcamentos','fotos_os','historico_os','financeiro','movimentos_estoque','pecas_aplicadas','notificacoes'] loop
  execute format('drop trigger if exists enforce_company_write on public.%I',tabela);
  execute format('create trigger enforce_company_write before insert or update or delete on public.%I for each row execute function private.enforce_operational_company_write()',tabela);
 end loop;
end $$;

revoke all on function private.enforce_operational_company_write() from public,anon,authenticated;

create or replace function public.catalogo(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'horario',e.horario,'solicitar_endereco',e.solicitar_endereco,'servicos',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'duracao',s.duracao) order by s.nome) from public.servicos s where s.empresa_id=e.id),'[]'::jsonb))
 from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

create or replace function public.perfil_assistencia(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalogo(p_slug)||jsonb_build_object('telefone',e.telefone,'endereco',e.endereco,'descricao',e.descricao_publica,'fotos_obrigatorias',e.fotos_obrigatorias)
 from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

create or replace function public.horarios_disponiveis(p_slug text,p_servico uuid,p_dia date) returns table(inicio timestamptz) language sql stable security definer set search_path='' as $$
 with config as (
  select e.*,s.duracao,e.horario->extract(dow from p_dia)::integer::text as janela from public.empresas e join public.servicos s on s.empresa_id=e.id
  where e.slug=p_slug and s.id=p_servico and p_dia between current_date and current_date+90 and private.public_company_available(e.id) and private.feature_enabled(e.id,'appointmentsEnabled')
 ),slots as (
  select c.id,g as inicio,g+make_interval(mins=>c.duracao) as fim from config c cross join lateral generate_series((p_dia+(c.janela->>0)::time) at time zone c.timezone,((p_dia+(c.janela->>1)::time) at time zone c.timezone)-make_interval(mins=>c.duracao),interval '15 minutes') g
 ) select s.inicio from slots s where s.inicio>now() and not exists(select 1 from public.agendamentos a where a.empresa_id=s.id and tstzrange(a.inicio,a.fim,'[)')&&tstzrange(s.inicio,s.fim,'[)')) order by s.inicio
$$;

create or replace function public.solicitar_reparo(p_slug text,p_cliente jsonb,p_equipamento jsonb,p_problema text,p_servico uuid default null,p_inicio timestamptz default null,p_endereco text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.empresas;c uuid;eq uuid;o public.ordens_servico;t uuid;tel text;categoria_equipamento text;begin
 select * into strict e from public.empresas where slug=p_slug and private.public_company_available(id);
 if p_inicio is not null and not private.feature_enabled(e.id,'appointmentsEnabled') then raise exception 'A agenda está temporariamente indisponível';end if;
 tel:=regexp_replace(p_cliente->>'whatsapp','\D','','g');
 categoria_equipamento:=coalesce(nullif(trim(p_equipamento->>'categoria'),''),'Outro');
 if tel is null or tel !~ '^[0-9]{10,15}$' or length(trim(coalesce(p_cliente->>'nome',''))) not between 2 and 100 then raise exception 'Informe nome e WhatsApp válidos';end if;
 if categoria_equipamento='Outro' and length(trim(coalesce(p_equipamento->>'tipo_personalizado',''))) not between 2 and 120 then raise exception 'Informe o tipo do equipamento';end if;
 if (select count(*) from public.ordens_servico os join public.clientes cl on cl.id=os.cliente_id where os.empresa_id=e.id and cl.whatsapp=tel and os.origem='cliente' and os.criado_em>now()-interval '1 day')>=5 then raise exception 'Limite de solicitações atingido. Entre em contato com a assistência';end if;
 insert into public.clientes(empresa_id,nome,whatsapp,email) values(e.id,trim(p_cliente->>'nome'),tel,nullif(left(p_cliente->>'email',200),'')) on conflict(empresa_id,whatsapp) do nothing returning id into c;
 if c is null then select id into strict c from public.clientes where empresa_id=e.id and whatsapp=tel;end if;
 insert into public.equipamentos(empresa_id,cliente_id,categoria,tipo_personalizado,marca,modelo,cor,numero_serie,imei,acessorios) values(e.id,c,categoria_equipamento,case when categoria_equipamento='Outro' then trim(p_equipamento->>'tipo_personalizado') else null end,coalesce(left(p_equipamento->>'marca',100),''),coalesce(left(p_equipamento->>'modelo',100),''),coalesce(left(p_equipamento->>'cor',100),''),'','','') returning id into eq;
 insert into public.ordens_servico(empresa_id,cliente_id,equipamento_id,problema,origem) values(e.id,c,eq,p_problema,'cliente') returning * into o;
 if p_inicio is not null then
  if p_servico is null then raise exception 'Selecione um serviço';end if;
  insert into public.agendamentos(empresa_id,ordem_id,servico_id,nome_cliente,telefone,endereco,inicio,finalidade) values(e.id,o.id,p_servico,trim(p_cliente->>'nome'),tel,p_endereco,p_inicio,'Recebimento');
 end if;
 insert into private.upload_tickets(ordem_id) values(o.id) returning token into t;
 return jsonb_build_object('id',o.id,'empresa_id',e.id,'numero',o.numero,'codigo',o.codigo_publico,'token',o.token_acompanhamento,'upload_token',t);
end $$;

create or replace function public.consultar_reparo(p_codigo text,p_telefone text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('numero',o.numero,'status',o.status,'previsao',o.previsao,'empresa',e.nome,'equipamento',jsonb_build_object('categoria',case when eq.categoria='Outro' then coalesce(eq.tipo_personalizado,eq.categoria) else eq.categoria end,'marca',eq.marca,'modelo',eq.modelo),'orcamento',(select jsonb_build_object('id',q.id,'versao',q.versao,'servicos',q.servicos,'pecas',q.pecas,'mao_obra',q.mao_obra,'desconto',q.desconto,'total',q.total,'validade',q.validade,'status',q.status) from public.orcamentos q where q.ordem_id=o.id and q.status<>'rascunho' and not exists(select 1 from public.orcamentos newer where newer.ordem_id=o.id and newer.versao>q.versao) order by q.versao desc limit 1),'historico',coalesce((select jsonb_agg(jsonb_build_object('evento',h.evento,'status',case when h.evento in ('Ordem criada','Status alterado') then h.detalhes else null end,'data',h.criado_em) order by h.criado_em) from public.historico_os h where h.ordem_id=o.id and h.publico),'[]'::jsonb))
 from public.ordens_servico o join public.clientes c on c.id=o.cliente_id join public.equipamentos eq on eq.id=o.equipamento_id join public.empresas e on e.id=o.empresa_id
 where length(p_codigo)=16 and o.codigo_publico=upper(p_codigo) and c.whatsapp=regexp_replace(p_telefone,'\D','','g') and private.public_company_available(e.id)
$$;

create or replace function public.acompanhar_por_token(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('numero',o.numero,'status',o.status,'previsao',o.previsao,'empresa',e.nome,'problema',o.problema,'equipamento',jsonb_build_object('categoria',case when eq.categoria='Outro' then coalesce(eq.tipo_personalizado,eq.categoria) else eq.categoria end,'marca',eq.marca,'modelo',eq.modelo),'orcamento',(select jsonb_build_object('id',q.id,'versao',q.versao,'servicos',q.servicos,'pecas',q.pecas,'mao_obra',q.mao_obra,'desconto',q.desconto,'total',q.total,'validade',q.validade,'status',q.status) from public.orcamentos q where q.ordem_id=o.id and q.status<>'rascunho' and not exists(select 1 from public.orcamentos newer where newer.ordem_id=o.id and newer.versao>q.versao) order by q.versao desc limit 1),'historico',coalesce((select jsonb_agg(jsonb_build_object('evento',h.evento,'status',case when h.evento in ('Ordem criada','Status alterado') then h.detalhes else null end,'data',h.criado_em) order by h.criado_em) from public.historico_os h where h.ordem_id=o.id and h.publico),'[]'::jsonb))
 from public.ordens_servico o join public.equipamentos eq on eq.id=o.equipamento_id and eq.empresa_id=o.empresa_id join public.empresas e on e.id=o.empresa_id
 where o.token_acompanhamento=p_token and private.public_company_available(e.id)
$$;

create or replace function private.pode_enviar_foto(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.ordens_servico o join public.empresas e on e.id=o.empresa_id
  where split_part(p_caminho,'/',1)=e.id::text and split_part(p_caminho,'/',2)=o.id::text and private.public_company_available(e.id) and (
   private.can_access_company(e.id) or exists(select 1 from private.upload_tickets t where t.ordem_id=o.id and t.token::text=split_part(p_caminho,'/',3) and t.expira_em>now() and (select count(*) from storage.objects s where s.bucket_id='os-fotos' and s.name like e.id::text||'/'||o.id::text||'/'||t.token::text||'/%')<20)
  )
 )
$$;

create or replace function private.pode_ler_foto(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ordens_servico o where private.can_access_company(o.empresa_id) and split_part(p_caminho,'/',1)=o.empresa_id::text and split_part(p_caminho,'/',2)=o.id::text)
$$;

revoke all on function public.catalogo(text),public.perfil_assistencia(text),public.horarios_disponiveis(text,uuid,date),public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text),public.consultar_reparo(text,text),public.acompanhar_por_token(uuid),private.pode_enviar_foto(text),private.pode_ler_foto(text) from public,anon,authenticated;
grant execute on function public.catalogo(text),public.perfil_assistencia(text),public.horarios_disponiveis(text,uuid,date),public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text),public.consultar_reparo(text,text),public.acompanhar_por_token(uuid) to anon,authenticated;
grant execute on function private.pode_enviar_foto(text) to anon,authenticated;
grant execute on function private.pode_ler_foto(text) to authenticated;

commit;
