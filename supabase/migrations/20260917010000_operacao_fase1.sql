begin;

alter table public.clientes
  add column telefone text,
  add column endereco text,
  add column observacoes text;

alter table public.servicos
  add column descricao text,
  add column garantia_dias integer not null default 0 check (garantia_dias between 0 and 3650),
  add column ativo boolean not null default true;

alter table public.pecas
  add column descricao text,
  add column foto_url text;

create table public.mesas_reparo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  nome text not null check (length(trim(nome)) between 2 and 80),
  descricao text,
  ordem_exibicao integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique(id,empresa_id)
);
create unique index mesas_reparo_empresa_nome_uidx on public.mesas_reparo(empresa_id,lower(nome));
create index mesas_reparo_empresa_ordem_idx on public.mesas_reparo(empresa_id,ordem_exibicao,nome);

alter table public.ordens_servico
  add column mesa_id uuid,
  add column prioridade text not null default 'normal' check (prioridade in ('baixa','normal','alta','urgente')),
  add column iniciado_em timestamptz,
  add column prazo_previsto timestamptz,
  add foreign key(mesa_id,empresa_id) references public.mesas_reparo(id,empresa_id);

alter table public.pecas_aplicadas
  add column custo_unitario numeric(12,2) not null default 0 check(custo_unitario>=0),
  add column valor_venda_unitario numeric(12,2) not null default 0 check(valor_venda_unitario>=0),
  add column mao_obra numeric(12,2) not null default 0 check(mao_obra>=0);
alter table public.pecas_aplicadas add constraint pecas_aplicadas_id_empresa_unique unique(id,empresa_id);

create table public.garantias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  ordem_id uuid not null,
  ordem_origem_id uuid,
  servico_id uuid,
  peca_aplicada_id uuid,
  descricao text not null check(length(trim(descricao)) between 2 and 300),
  inicio date not null,
  fim date not null,
  observacoes text,
  status text not null default 'ativa' check(status in ('ativa','acionada','encerrada','cancelada')),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id),
  unique(id,empresa_id),
  foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id),
  foreign key(ordem_origem_id,empresa_id) references public.ordens_servico(id,empresa_id),
  foreign key(servico_id,empresa_id) references public.servicos(id,empresa_id),
  foreign key(peca_aplicada_id,empresa_id) references public.pecas_aplicadas(id,empresa_id),
  check(fim>=inicio)
);
create index garantias_empresa_status_idx on public.garantias(empresa_id,status,fim);
create index garantias_ordem_idx on public.garantias(ordem_id,empresa_id);

alter table public.mesas_reparo enable row level security;
alter table public.garantias enable row level security;
revoke all on public.mesas_reparo,public.garantias from anon,authenticated;
grant select,insert,update on public.mesas_reparo,public.garantias to authenticated;

create policy tenant_member_select on public.mesas_reparo for select to authenticated using(private.can_access_company(empresa_id));
create policy tenant_member_insert on public.mesas_reparo for insert to authenticated with check(private.can_access_company(empresa_id));
create policy tenant_member_update on public.mesas_reparo for update to authenticated using(private.can_access_company(empresa_id)) with check(private.can_access_company(empresa_id));
create policy tenant_member_select on public.garantias for select to authenticated using(private.can_access_company(empresa_id));
create policy tenant_member_insert on public.garantias for insert to authenticated with check(private.can_access_company(empresa_id));
create policy tenant_member_update on public.garantias for update to authenticated using(private.can_access_company(empresa_id)) with check(private.can_access_company(empresa_id));

create trigger enforce_company_write before insert or update or delete on public.mesas_reparo for each row execute function private.enforce_operational_company_write();
create trigger enforce_company_write before insert or update or delete on public.garantias for each row execute function private.enforce_operational_company_write();

create or replace function private.prevent_duplicate_customer() returns trigger language plpgsql set search_path='' as $$
begin
 if nullif(trim(new.email),'') is not null and exists(select 1 from public.clientes c where c.empresa_id=new.empresa_id and c.id<>new.id and lower(trim(c.email))=lower(trim(new.email))) then raise exception 'Já existe um cliente com este e-mail';end if;
 if nullif(regexp_replace(coalesce(new.documento,''),'\D','','g'),'') is not null and exists(select 1 from public.clientes c where c.empresa_id=new.empresa_id and c.id<>new.id and regexp_replace(coalesce(c.documento,''),'\D','','g')=regexp_replace(new.documento,'\D','','g')) then raise exception 'Já existe um cliente com este CPF/CNPJ';end if;
 return new;
end $$;
create trigger prevent_duplicate_customer before insert or update on public.clientes for each row execute function private.prevent_duplicate_customer();

create or replace function public.mover_ordem_reparo(p_ordem uuid,p_status text,p_mesa uuid default null,p_prioridade text default null) returns void language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;m public.mesas_reparo;prioridade_final text;autor_nome text;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not private.can_access_company(o.empresa_id) then raise exception 'Ordem não autorizada';end if;
 if p_status not in ('novo','recebido','em_diagnostico','aguardando_orcamento','orcamento_enviado','aguardando_aprovacao','orcamento_aprovado','em_reparo','aguardando_peca','em_testes','pronto_retirada','finalizado','cancelado') then raise exception 'Status inválido';end if;
 if p_mesa is not null then select * into strict m from public.mesas_reparo where id=p_mesa and empresa_id=o.empresa_id and ativo;end if;
 prioridade_final:=coalesce(p_prioridade,o.prioridade);
 if prioridade_final not in ('baixa','normal','alta','urgente') then raise exception 'Prioridade inválida';end if;
 select coalesce(nullif(trim(nome),''),'Equipe técnica') into autor_nome from public.perfis where usuario_id=auth.uid();
 update public.ordens_servico set status=p_status,mesa_id=p_mesa,prioridade=prioridade_final,iniciado_em=case when p_status in ('em_reparo','em_testes') then coalesce(iniciado_em,now()) else iniciado_em end where id=o.id;
 if o.mesa_id is distinct from p_mesa or o.prioridade is distinct from prioridade_final then
  insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor)
  values(o.empresa_id,o.id,'Organização da bancada',concat_ws(' · ',case when p_mesa is null then 'Sem mesa' else 'Mesa: '||m.nome end,'Prioridade: '||prioridade_final),false,auth.uid(),coalesce(autor_nome,'Equipe técnica'));
 end if;
end $$;

create or replace function public.registrar_peca_aplicada_valores(p_ordem uuid,p_nome text,p_quantidade integer,p_peca uuid default null,p_custo_unitario numeric default null,p_valor_venda_unitario numeric default null,p_mao_obra numeric default 0) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;p public.pecas;id_novo uuid;nome_final text;custo_final numeric;venda_final numeric;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not private.can_access_company(o.empresa_id) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Ordem encerrada';end if;
 if p_quantidade is null or p_quantidade not between 1 and 1000 then raise exception 'Quantidade inválida';end if;
 if coalesce(p_mao_obra,0)<0 then raise exception 'Mão de obra inválida';end if;
 nome_final:=trim(p_nome);
 custo_final:=coalesce(p_custo_unitario,0);venda_final:=coalesce(p_valor_venda_unitario,0);
 if p_peca is not null then
  select * into strict p from public.pecas where id=p_peca and empresa_id=o.empresa_id and ativo for update;
  if p.quantidade<p_quantidade then raise exception 'Quantidade indisponível no estoque';end if;
  if length(nome_final)<2 then nome_final:=p.nome;end if;
  custo_final:=coalesce(p_custo_unitario,p.custo);venda_final:=coalesce(p_valor_venda_unitario,p.preco);
  perform set_config('horaria.ordem_estoque',o.id::text,true);perform set_config('horaria.motivo_estoque','Uso na OS #'||o.numero,true);
  update public.pecas set quantidade=quantidade-p_quantidade where id=p.id;
  perform set_config('horaria.ordem_estoque','',true);perform set_config('horaria.motivo_estoque','',true);
 end if;
 if length(nome_final) not between 2 and 200 or custo_final<0 or venda_final<0 then raise exception 'Valores da peça inválidos';end if;
 insert into public.pecas_aplicadas(empresa_id,ordem_id,peca_id,nome,quantidade,custo_unitario,valor_venda_unitario,mao_obra)
 values(o.empresa_id,o.id,p_peca,nome_final,p_quantidade,custo_final,venda_final,coalesce(p_mao_obra,0)) returning id into id_novo;
 if p_peca is null then insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(o.empresa_id,o.id,'Peça aplicada',nome_final||' · '||p_quantidade||' unidade(s)',auth.uid(),'Equipe técnica');end if;
 return id_novo;
end $$;

create or replace function public.salvar_garantia(p_ordem uuid,p_descricao text,p_inicio date,p_fim date,p_observacoes text default null,p_ordem_origem uuid default null,p_servico uuid default null,p_peca_aplicada uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;id_novo uuid;begin
 select * into strict o from public.ordens_servico where id=p_ordem;
 if not private.can_access_company(o.empresa_id) then raise exception 'Ordem não autorizada';end if;
 if length(trim(coalesce(p_descricao,''))) not between 2 and 300 or p_inicio is null or p_fim<p_inicio then raise exception 'Garantia inválida';end if;
 if p_ordem_origem is not null and not exists(select 1 from public.ordens_servico where id=p_ordem_origem and empresa_id=o.empresa_id) then raise exception 'Ordem de origem inválida';end if;
 if p_servico is not null and not exists(select 1 from public.servicos where id=p_servico and empresa_id=o.empresa_id) then raise exception 'Serviço inválido';end if;
 if p_peca_aplicada is not null and not exists(select 1 from public.pecas_aplicadas where id=p_peca_aplicada and empresa_id=o.empresa_id) then raise exception 'Peça aplicada inválida';end if;
 insert into public.garantias(empresa_id,ordem_id,ordem_origem_id,servico_id,peca_aplicada_id,descricao,inicio,fim,observacoes)
 values(o.empresa_id,o.id,p_ordem_origem,p_servico,p_peca_aplicada,trim(p_descricao),p_inicio,p_fim,p_observacoes) returning id into id_novo;
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor) values(o.empresa_id,o.id,'Garantia registrada',trim(p_descricao)||' · até '||to_char(p_fim,'DD/MM/YYYY'),true,auth.uid(),'Equipe técnica');
 return id_novo;
end $$;

create or replace function public.catalogo(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'horario',e.horario,'solicitar_endereco',e.solicitar_endereco,'servicos',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'duracao',s.duracao) order by s.nome) from public.servicos s where s.empresa_id=e.id and s.ativo),'[]'::jsonb))
 from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

create or replace function public.horarios_disponiveis(p_slug text,p_servico uuid,p_dia date) returns table(inicio timestamptz) language sql stable security definer set search_path='' as $$
 with config as (
  select e.*,s.duracao,e.horario->extract(dow from p_dia)::integer::text as janela from public.empresas e join public.servicos s on s.empresa_id=e.id and s.ativo
  where e.slug=p_slug and s.id=p_servico and p_dia between current_date and current_date+90 and private.public_company_available(e.id) and private.feature_enabled(e.id,'appointmentsEnabled')
 ),slots as (
  select c.id,g as inicio,g+make_interval(mins=>c.duracao) as fim from config c cross join lateral generate_series((p_dia+(c.janela->>0)::time) at time zone c.timezone,((p_dia+(c.janela->>1)::time) at time zone c.timezone)-make_interval(mins=>c.duracao),interval '15 minutes') g
 ) select s.inicio from slots s where s.inicio>now() and not exists(select 1 from public.agendamentos a where a.empresa_id=s.id and tstzrange(a.inicio,a.fim,'[)')&&tstzrange(s.inicio,s.fim,'[)')) order by s.inicio
$$;

revoke all on function public.mover_ordem_reparo(uuid,text,uuid,text),public.registrar_peca_aplicada_valores(uuid,text,integer,uuid,numeric,numeric,numeric),public.salvar_garantia(uuid,text,date,date,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mover_ordem_reparo(uuid,text,uuid,text),public.registrar_peca_aplicada_valores(uuid,text,integer,uuid,numeric,numeric,numeric),public.salvar_garantia(uuid,text,date,date,text,uuid,uuid,uuid) to authenticated;

commit;
