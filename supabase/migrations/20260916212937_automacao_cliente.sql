begin;

alter table public.equipamentos drop constraint if exists equipamentos_categoria_check;
alter table public.equipamentos add constraint equipamentos_categoria_check check(categoria in ('Celular','Fone de ouvido','Notebook','Computador','Tablet','Console','TV','Monitor','Impressora','Smartwatch','Acessório','Eletrônico','Outro')) not valid;
alter table public.ordens_servico add column token_acompanhamento uuid not null default gen_random_uuid() unique;

create table public.pecas_aplicadas(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,ordem_id uuid not null,peca_id uuid,
 nome text not null check(length(trim(nome)) between 2 and 200),quantidade integer not null check(quantidade between 1 and 1000),
 criado_em timestamptz not null default now(),usuario_id uuid default auth.uid() references auth.users(id),
 foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id),
 foreign key(peca_id,empresa_id) references public.pecas(id,empresa_id)
);
alter table public.pecas_aplicadas enable row level security;
revoke all on public.pecas_aplicadas from anon,authenticated;
grant select on public.pecas_aplicadas to authenticated;
create policy tenant_select on public.pecas_aplicadas for select to authenticated using(empresa_id in(select id from public.empresas where dono_id=(select auth.uid())));
create index pecas_aplicadas_empresa_idx on public.pecas_aplicadas(empresa_id);
create index pecas_aplicadas_ordem_empresa_idx on public.pecas_aplicadas(ordem_id,empresa_id);
create index pecas_aplicadas_peca_empresa_idx on public.pecas_aplicadas(peca_id,empresa_id);

create table public.notificacoes(
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,ordem_id uuid not null,orcamento_id uuid,
 canal text not null default 'whatsapp' check(canal='whatsapp'),evento text not null,
 chave_idempotencia text not null unique,destinatario text not null check(destinatario ~ '^[0-9]{10,15}$'),
 mensagem text not null,payload jsonb not null default '{}',status text not null default 'pendente' check(status in ('pendente','processando','enviada','falhou')),
 tentativas integer not null default 0 check(tentativas>=0),ultimo_erro text,enviado_em timestamptz,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id),
 foreign key(orcamento_id,empresa_id) references public.orcamentos(id,empresa_id)
);
alter table public.notificacoes enable row level security;
revoke all on public.notificacoes from anon,authenticated;
grant select on public.notificacoes to authenticated;
create policy tenant_select on public.notificacoes for select to authenticated using(empresa_id in(select id from public.empresas where dono_id=(select auth.uid())));
create index notificacoes_empresa_status_idx on public.notificacoes(empresa_id,status,criado_em);
create index notificacoes_ordem_empresa_idx on public.notificacoes(ordem_id,empresa_id);
create index notificacoes_orcamento_empresa_idx on public.notificacoes(orcamento_id,empresa_id);

create function public.registrar_peca_aplicada(p_ordem uuid,p_nome text,p_quantidade integer,p_peca uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;p public.pecas;id_novo uuid;nome_final text;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not exists(select 1 from public.empresas where id=o.empresa_id and dono_id=auth.uid()) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Ordem encerrada';end if;
 if p_quantidade is null or p_quantidade not between 1 and 1000 then raise exception 'Quantidade inválida';end if;
 nome_final:=trim(p_nome);
 if p_peca is not null then
  select * into strict p from public.pecas where id=p_peca and empresa_id=o.empresa_id for update;
  if p.quantidade<p_quantidade then raise exception 'Quantidade indisponível no estoque';end if;
  if length(nome_final)<2 then nome_final:=p.nome;end if;
  update public.pecas set quantidade=quantidade-p_quantidade where id=p.id;
 end if;
 if length(nome_final) not between 2 and 200 then raise exception 'Informe a peça utilizada';end if;
 insert into public.pecas_aplicadas(empresa_id,ordem_id,peca_id,nome,quantidade) values(o.empresa_id,o.id,p_peca,nome_final,p_quantidade) returning id into id_novo;
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(o.empresa_id,o.id,'Peça aplicada',nome_final||' · '||p_quantidade||' unidade(s)',auth.uid(),'Equipe técnica');
 return id_novo;
end $$;

create function private.enfileirar_notificacao_ordem() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.clientes;eq public.equipamentos;begin
 if new.status='pronto_retirada' and old.status is distinct from new.status then
  select * into strict c from public.clientes where id=new.cliente_id and empresa_id=new.empresa_id;
  select * into strict eq from public.equipamentos where id=new.equipamento_id and empresa_id=new.empresa_id;
  insert into public.notificacoes(empresa_id,ordem_id,evento,chave_idempotencia,destinatario,mensagem,payload)
  values(new.empresa_id,new.id,'pronto_retirada','ordem:'||new.id||':pronto_retirada',c.whatsapp,'Olá, '||c.nome||'. Seu '||trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo))||' já está pronto para retirada.',jsonb_build_object('token',new.token_acompanhamento,'numero',new.numero)) on conflict(chave_idempotencia) do nothing;
 end if;return new;
end $$;

create function private.enfileirar_notificacao_orcamento() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;c public.clientes;begin
 if new.status='enviado' and (TG_OP='INSERT' or old.status is distinct from new.status) then
  select * into strict o from public.ordens_servico where id=new.ordem_id;
  select * into strict c from public.clientes where id=o.cliente_id and empresa_id=o.empresa_id;
  insert into public.notificacoes(empresa_id,ordem_id,orcamento_id,evento,chave_idempotencia,destinatario,mensagem,payload)
  values(new.empresa_id,new.ordem_id,new.id,'orcamento_enviado','orcamento:'||new.id||':enviado',c.whatsapp,'Olá, '||c.nome||'. O orçamento da sua OS #'||o.numero||' está disponível para análise.',jsonb_build_object('token',o.token_acompanhamento,'numero',o.numero,'total',new.total)) on conflict(chave_idempotencia) do nothing;
 end if;return new;
end $$;

create trigger notificar_ordem after update on public.ordens_servico for each row execute function private.enfileirar_notificacao_ordem();
create trigger notificar_orcamento after insert or update on public.orcamentos for each row execute function private.enfileirar_notificacao_orcamento();

create or replace function public.salvar_orcamento(p_ordem uuid,p_servicos jsonb,p_pecas jsonb,p_mao_obra numeric,p_desconto numeric,p_validade date) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;item jsonb;soma numeric:=0;v integer;q uuid;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not exists(select 1 from public.empresas where id=o.empresa_id and dono_id=auth.uid()) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Esta ordem está encerrada';end if;
 if p_servicos is null or p_pecas is null or jsonb_typeof(p_servicos)<>'array' or jsonb_typeof(p_pecas)<>'array' or jsonb_array_length(p_servicos)+jsonb_array_length(p_pecas)>100 then raise exception 'Itens inválidos';end if;
 if p_mao_obra is null or p_desconto is null or p_mao_obra<0 or p_desconto<0 or p_mao_obra>10000000 or p_desconto>10000000 or p_validade is null or p_validade<current_date then raise exception 'Valores ou validade inválidos';end if;
 for item in select * from jsonb_array_elements(p_servicos||p_pecas) loop
  if coalesce(length(trim(item->>'nome')),0)<2 or (item->>'quantidade') is null or (item->>'valor') is null or (item->>'quantidade')::numeric<>trunc((item->>'quantidade')::numeric) or (item->>'quantidade')::numeric not between 1 and 1000 or (item->>'valor')::numeric not between 0 and 10000000 then raise exception 'Item inválido';end if;
  if nullif(item->>'peca_id','') is not null and not exists(select 1 from public.pecas where id=(item->>'peca_id')::uuid and empresa_id=o.empresa_id) then raise exception 'Peça não autorizada';end if;
  if nullif(item->>'servico_id','') is not null and not exists(select 1 from public.servicos where id=(item->>'servico_id')::uuid and empresa_id=o.empresa_id) then raise exception 'Serviço não autorizado';end if;
  soma:=soma+(item->>'quantidade')::numeric*round((item->>'valor')::numeric,2);
 end loop;
 soma:=round(soma+p_mao_obra-p_desconto,2);if soma<0 then raise exception 'Desconto maior que o orçamento';end if;
 select coalesce(max(versao),0)+1 into v from public.orcamentos where ordem_id=p_ordem;
 insert into public.orcamentos(empresa_id,ordem_id,versao,servicos,pecas,mao_obra,desconto,total,validade,status) values(o.empresa_id,o.id,v,p_servicos,p_pecas,p_mao_obra,p_desconto,soma,p_validade,'enviado') returning id into q;
 update public.ordens_servico set status='aguardando_aprovacao' where id=o.id;
 return q;
end $$;

create function public.acompanhar_por_token(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('numero',o.numero,'status',o.status,'previsao',o.previsao,'empresa',e.nome,'problema',o.problema,'equipamento',jsonb_build_object('categoria',eq.categoria,'marca',eq.marca,'modelo',eq.modelo),'orcamento',(select jsonb_build_object('id',q.id,'versao',q.versao,'servicos',q.servicos,'pecas',q.pecas,'mao_obra',q.mao_obra,'desconto',q.desconto,'total',q.total,'validade',q.validade,'status',q.status) from public.orcamentos q where q.ordem_id=o.id and q.status<>'rascunho' and not exists(select 1 from public.orcamentos newer where newer.ordem_id=o.id and newer.versao>q.versao) order by q.versao desc limit 1),'historico',coalesce((select jsonb_agg(jsonb_build_object('evento',h.evento,'status',case when h.evento in ('Ordem criada','Status alterado') then h.detalhes else null end,'data',h.criado_em) order by h.criado_em) from public.historico_os h where h.ordem_id=o.id and h.publico),'[]'::jsonb))
 from public.ordens_servico o join public.equipamentos eq on eq.id=o.equipamento_id and eq.empresa_id=o.empresa_id join public.empresas e on e.id=o.empresa_id where o.token_acompanhamento=p_token
$$;

create function public.responder_orcamento_link(p_orcamento uuid,p_decisao text,p_observacao text,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos;o public.ordens_servico;begin
 perform 1 from public.ordens_servico where id=(select ordem_id from public.orcamentos where id=p_orcamento) for update;
 select * into strict q from public.orcamentos where id=p_orcamento for update;
 select * into strict o from public.ordens_servico where id=q.ordem_id;
 if o.token_acompanhamento is distinct from p_token then raise exception 'Orçamento não encontrado';end if;
 if p_decisao not in ('aprovado','recusado','alteracao_solicitada') or length(coalesce(p_observacao,''))>1000 then raise exception 'Resposta inválida';end if;
 if q.status<>'enviado' or o.status in ('cancelado','finalizado') or exists(select 1 from public.orcamentos where ordem_id=q.ordem_id and versao>q.versao) then raise exception 'Este orçamento não aceita novas respostas';end if;
 if p_decisao='aprovado' and q.validade<current_date then raise exception 'Orçamento vencido. Solicite uma nova versão';end if;
 update public.orcamentos set status=p_decisao,resposta=p_observacao,respondido_em=now() where id=q.id;
 update public.ordens_servico set status=case when p_decisao='aprovado' then 'orcamento_aprovado' else 'aguardando_orcamento' end where id=o.id;
end $$;

create or replace function private.proteger_ordem() returns trigger language plpgsql set search_path='' as $$begin
 if (new.id,new.empresa_id,new.cliente_id,new.equipamento_id,new.codigo_publico,new.token_acompanhamento,new.criado_em) is distinct from (old.id,old.empresa_id,old.cliente_id,old.equipamento_id,old.codigo_publico,old.token_acompanhamento,old.criado_em) then raise exception 'Identidade da ordem não pode ser alterada';end if;
 new.atualizado_em:=now();return new;end $$;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agendamentos') then alter publication supabase_realtime add table public.agendamentos;end if;
end $$;

revoke all on function public.registrar_peca_aplicada(uuid,text,integer,uuid),public.acompanhar_por_token(uuid),public.responder_orcamento_link(uuid,text,text,uuid),private.enfileirar_notificacao_ordem(),private.enfileirar_notificacao_orcamento() from public,anon,authenticated;
grant execute on function public.registrar_peca_aplicada(uuid,text,integer,uuid) to authenticated;
grant execute on function public.acompanhar_por_token(uuid),public.responder_orcamento_link(uuid,text,text,uuid) to anon,authenticated;

commit;
