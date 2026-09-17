-- Migração aditiva: preserva empresas, serviços e agendamentos existentes.
begin;
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
alter table public.empresas add column fotos_obrigatorias boolean not null default false, add column telefone text, add column endereco text, add column descricao_publica text;
alter table public.servicos add column categoria text not null default 'Outro', add column preco numeric(12,2) not null default 0 check(preco>=0);
create table public.clientes(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),nome text not null check(length(trim(nome)) between 2 and 120),whatsapp text not null check(whatsapp ~ '^[0-9]{10,15}$'),email text,documento text,criado_em timestamptz not null default now(),unique(id,empresa_id),unique(empresa_id,whatsapp));
create table public.equipamentos(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),cliente_id uuid not null,categoria text not null check(categoria in ('Celular','Notebook','Computador','Tablet','Console','TV','Monitor','Impressora','Smartwatch','Acessório','Outro')),marca text not null default '',modelo text not null check(length(trim(modelo)) between 1 and 120),cor text,numero_serie text,imei text,acessorios text,criado_em timestamptz not null default now(),unique(id,empresa_id),unique(id,empresa_id,cliente_id),foreign key(cliente_id,empresa_id) references public.clientes(id,empresa_id));
create table public.ordens_servico(id uuid primary key default gen_random_uuid(),numero bigint generated always as identity(start with 1001) unique,empresa_id uuid not null references public.empresas(id),cliente_id uuid not null,equipamento_id uuid not null,codigo_publico text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),problema text not null check(length(trim(problema)) between 3 and 5000),estado text[] not null default '{}',observacoes_estado text,tecnico text not null default '',status text not null default 'novo' check(status in ('novo','recebido','em_diagnostico','aguardando_orcamento','orcamento_enviado','aguardando_aprovacao','orcamento_aprovado','em_reparo','aguardando_peca','em_testes','pronto_retirada','finalizado','cancelado')),previsao date,entrada_confirmada boolean not null default false,origem text not null default 'assistencia' check(origem in ('assistencia','cliente')),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),criado_por uuid default auth.uid() references auth.users(id),unique(id,empresa_id),foreign key(cliente_id,empresa_id) references public.clientes(id,empresa_id),foreign key(equipamento_id,empresa_id,cliente_id) references public.equipamentos(id,empresa_id,cliente_id));
create table public.equipamento_segredos(ordem_id uuid primary key,empresa_id uuid not null,senha text not null check(length(senha)<=200),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
create table public.diagnosticos(ordem_id uuid primary key,empresa_id uuid not null,problema_identificado text not null default '',testes_realizados text not null default '',pecas_necessarias text not null default '',observacoes text not null default '',atualizado_em timestamptz not null default now(),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
create table public.pecas(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),nome text not null check(length(trim(nome))>=2),compatibilidade text,quantidade integer not null default 0 check(quantidade>=0),custo numeric(12,2) not null default 0 check(custo>=0),preco numeric(12,2) not null default 0 check(preco>=0),fornecedor text,estoque_minimo integer not null default 1 check(estoque_minimo>=0),unique(id,empresa_id));
create table public.orcamentos(id uuid primary key default gen_random_uuid(),empresa_id uuid not null,ordem_id uuid not null,versao integer not null,servicos jsonb not null default '[]',pecas jsonb not null default '[]',mao_obra numeric(12,2) not null default 0 check(mao_obra>=0),desconto numeric(12,2) not null default 0 check(desconto>=0),total numeric(12,2) not null default 0 check(total>=0),validade date not null,status text not null default 'rascunho' check(status in ('rascunho','enviado','aprovado','recusado','alteracao_solicitada')),resposta text,criado_em timestamptz not null default now(),respondido_em timestamptz,unique(ordem_id,versao),unique(id,empresa_id),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
create table public.fotos_os(id uuid primary key default gen_random_uuid(),empresa_id uuid not null,ordem_id uuid not null,caminho text not null unique,url text not null,categoria text not null check(categoria in ('Entrada','Diagnóstico','Durante o reparo','Após o reparo','Entrega','Outro')),descricao text,criado_em timestamptz not null default now(),usuario_id uuid references auth.users(id),autor text not null,foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
create table public.historico_os(id bigint generated always as identity primary key,empresa_id uuid not null,ordem_id uuid not null,evento text not null,detalhes text,publico boolean not null default false,criado_em timestamptz not null default now(),usuario_id uuid references auth.users(id),autor text not null,foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
create table public.financeiro(id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),ordem_id uuid,descricao text not null check(length(trim(descricao))>=2),tipo text not null check(tipo in ('receita','despesa')),valor numeric(12,2) not null check(valor>0),status text not null default 'pendente' check(status in ('pendente','pago')),vencimento date not null,pago_em date,criado_em timestamptz not null default now(),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id),check((status='pago' and pago_em is not null) or (status='pendente' and pago_em is null)));
create table public.movimentos_estoque(id uuid primary key default gen_random_uuid(),empresa_id uuid not null,peca_id uuid not null,ordem_id uuid,quantidade integer not null check(quantidade<>0),motivo text not null,criado_em timestamptz not null default now(),foreign key(peca_id,empresa_id) references public.pecas(id,empresa_id),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id));
alter table public.agendamentos add column ordem_id uuid, add column finalidade text not null default 'Atendimento agendado' check(finalidade in ('Recebimento','Diagnóstico','Retirada','Visita técnica','Atendimento agendado')),add foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id);
do $$ declare t text; begin
 foreach t in array array['clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','orcamentos','fotos_os','historico_os','financeiro','movimentos_estoque'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy tenant_select on public.%I for select to authenticated using (empresa_id in (select id from public.empresas where dono_id=(select auth.uid())))',t);
  execute format('create index on public.%I(empresa_id)',t);
 end loop;
 foreach t in array array['clientes','equipamentos','ordens_servico','equipamento_segredos','diagnosticos','pecas','financeiro'] loop
  execute format('grant insert,update on public.%I to authenticated',t);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(empresa_id in (select id from public.empresas where dono_id=(select auth.uid())))',t);
  execute format('create policy tenant_update on public.%I for update to authenticated using(empresa_id in (select id from public.empresas where dono_id=(select auth.uid()))) with check(empresa_id in (select id from public.empresas where dono_id=(select auth.uid())))',t);
 end loop;
end $$;
grant usage on sequence public.ordens_servico_numero_seq to authenticated;
create index on public.equipamentos(cliente_id,empresa_id);
create index on public.ordens_servico(equipamento_id,empresa_id,cliente_id);
create index on public.ordens_servico(cliente_id,empresa_id);
create index on public.ordens_servico(empresa_id,status,criado_em desc);
create index on public.fotos_os(ordem_id,criado_em);
create index on public.historico_os(ordem_id,criado_em);
create index on public.financeiro(ordem_id,empresa_id);
create index on public.movimentos_estoque(peca_id,empresa_id);
create index on public.movimentos_estoque(ordem_id,empresa_id);
create index on public.agendamentos(ordem_id,empresa_id);
create function private.auditar_ordem() returns trigger language plpgsql security definer set search_path='' as $$
declare evento text; detalhes text; begin
 if TG_OP='INSERT' then evento:='Ordem criada'; detalhes:=new.status;
 elsif new.status is distinct from old.status then evento:='Status alterado';detalhes:=new.status;
 else evento:='Ordem atualizada';detalhes:='Dados de atendimento atualizados';end if;
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor) values(new.empresa_id,new.id,evento,detalhes,TG_OP='INSERT' or new.status is distinct from old.status,auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end);
 return new;end $$;
create function private.proteger_ordem() returns trigger language plpgsql set search_path='' as $$ begin
 if (new.id,new.empresa_id,new.cliente_id,new.equipamento_id,new.codigo_publico,new.criado_em) is distinct from (old.id,old.empresa_id,old.cliente_id,old.equipamento_id,old.codigo_publico,old.criado_em) then raise exception 'Identidade da ordem não pode ser alterada';end if;
 new.atualizado_em:=now();return new;end $$;
create trigger proteger_ordem before update on public.ordens_servico for each row execute function private.proteger_ordem();
create trigger auditar_ordem after insert or update on public.ordens_servico for each row execute function private.auditar_ordem();
revoke all on function private.proteger_ordem(),private.auditar_ordem() from public,anon,authenticated;
commit;
